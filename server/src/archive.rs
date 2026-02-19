use std::collections::HashMap;
use std::io::{self, Read, Write, Seek};
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use chrono::TimeZone;

use crate::protocol::{ArchiveEntry, ArchiveEntryType, ArchiveListing};

// ============================================================================
// Format Detection
// ============================================================================

#[derive(Debug, Clone, PartialEq)]
pub enum ArchiveFormat {
    // Existing formats
    Zip,
    Tar,
    TarGz,
    TarBz2,
    TarXz,
    TarZst,
    Gz,   // single-file gzip
    Bz2,  // single-file bzip2
    Xz,   // single-file xz
    Zst,  // single-file zstd
    
    // New formats
    SevenZip, // 7z
    Rar,
    Cab,
    Arj,
    Lzh,
    Ace,
}

impl ArchiveFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            // Existing
            ArchiveFormat::Zip => "zip",
            ArchiveFormat::Tar => "tar",
            ArchiveFormat::TarGz => "tar.gz",
            ArchiveFormat::TarBz2 => "tar.bz2",
            ArchiveFormat::TarXz => "tar.xz",
            ArchiveFormat::TarZst => "tar.zst",
            ArchiveFormat::Gz => "gz",
            ArchiveFormat::Bz2 => "bz2",
            ArchiveFormat::Xz => "xz",
            ArchiveFormat::Zst => "zst",
            
            // New
            ArchiveFormat::SevenZip => "7z",
            ArchiveFormat::Rar => "rar",
            ArchiveFormat::Cab => "cab",
            ArchiveFormat::Arj => "arj",
            ArchiveFormat::Lzh => "lzh",
            ArchiveFormat::Ace => "ace",
        }
    }

    /// Detect archive format from the file name (extension).
    pub fn detect(path: &str) -> Option<Self> {
        let lower = path.to_lowercase();
        
        // Existing formats
        if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
            Some(ArchiveFormat::TarGz)
        } else if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz2") || lower.ends_with(".tbz") {
            Some(ArchiveFormat::TarBz2)
        } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
            Some(ArchiveFormat::TarXz)
        } else if lower.ends_with(".tar.zst") || lower.ends_with(".tar.zstd") || lower.ends_with(".tzst") {
            Some(ArchiveFormat::TarZst)
        } else if lower.ends_with(".tar") {
            Some(ArchiveFormat::Tar)
        } else if lower.ends_with(".zip") || lower.ends_with(".jar") || lower.ends_with(".war")
            || lower.ends_with(".ear") || lower.ends_with(".apk") || lower.ends_with(".docx")
            || lower.ends_with(".xlsx") || lower.ends_with(".pptx") || lower.ends_with(".odt")
            || lower.ends_with(".ods") || lower.ends_with(".odp")
        {
            Some(ArchiveFormat::Zip)
        } else if lower.ends_with(".gz") {
            Some(ArchiveFormat::Gz)
        } else if lower.ends_with(".bz2") {
            Some(ArchiveFormat::Bz2)
        } else if lower.ends_with(".xz") {
            Some(ArchiveFormat::Xz)
        } else if lower.ends_with(".zst") || lower.ends_with(".zstd") {
            Some(ArchiveFormat::Zst)
        }
        // New formats
        else if lower.ends_with(".7z") {
            Some(ArchiveFormat::SevenZip)
        } else if lower.ends_with(".rar") {
            Some(ArchiveFormat::Rar)
        } else if lower.ends_with(".cab") {
            Some(ArchiveFormat::Cab)
        } else if lower.ends_with(".arj") {
            Some(ArchiveFormat::Arj)
        } else if lower.ends_with(".lzh") || lower.ends_with(".lha") {
            Some(ArchiveFormat::Lzh)
        } else if lower.ends_with(".ace") {
            Some(ArchiveFormat::Ace)
        } else {
            None
        }
    }
}

// ============================================================================
// Helper: normalise inner paths
// ============================================================================

/// Strip leading slashes, normalise to forward slashes, remove trailing slash.
fn normalise_inner(p: &str) -> String {
    let s = p.replace('\\', "/");
    let s = s.trim_start_matches('/');
    let s = s.trim_end_matches('/');
    s.to_string()
}

/// Returns `true` if `entry` is a direct child of `parent` (both normalised).
/// parent = "" means top-level.
fn is_direct_child(entry: &str, parent: &str) -> bool {
    if parent.is_empty() {
        // entry must not contain '/'
        !entry.contains('/')
    } else {
        entry.starts_with(&format!("{}/", parent))
            && !entry[parent.len() + 1..].contains('/')
    }
}

/// Returns the direct-child key of `entry` relative to `parent`.
/// e.g. entry="a/b/c", parent="a" → "a/b"
fn direct_child_path(entry: &str, parent: &str) -> String {
    if parent.is_empty() {
        entry.split('/').next().unwrap_or(entry).to_string()
    } else {
        let rest = &entry[parent.len() + 1..];
        let child_name = rest.split('/').next().unwrap_or(rest);
        format!("{}/{}", parent, child_name)
    }
}

// ============================================================================
// ZIP listing (existing)
// ============================================================================

pub fn list_zip(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    let mut zip = zip::ZipArchive::new(file).context("Not a valid ZIP archive")?;

    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for i in 0..zip.len() {
        let entry = zip.by_index(i).context("Error reading ZIP entry")?;
        let raw_name = entry.name();
        let name = normalise_inner(raw_name);

        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path
            .rsplit('/')
            .next()
            .unwrap_or(&child_path)
            .to_string();

        if child_path == name {
            let is_dir = entry.is_dir();
            let modified = entry
                .last_modified()
                .map(|t| {
                    chrono::Utc
                        .with_ymd_and_hms(
                            t.year() as i32,
                            t.month() as u32,
                            t.day() as u32,
                            t.hour() as u32,
                            t.minute() as u32,
                            t.second() as u32,
                        )
                        .single()
                        .map(|dt| dt.timestamp())
                        .unwrap_or(0)
                })
                .unwrap_or(0);

            let compression = format!("{:?}", entry.compression());

            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                modified,
                compression,
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "Stored".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Zip.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// TAR listing (existing)
// ============================================================================

fn list_tar_reader<R: Read>(
    mut archive: tar::Archive<R>,
    archive_path: &str,
    inner_path: &str,
    format: &str,
) -> Result<ArchiveListing> {
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry_result in archive.entries().context("Error iterating TAR entries")? {
        let entry = entry_result.context("Error reading TAR entry")?;
        let path_raw = entry
            .path()
            .context("Invalid TAR entry path")?
            .to_string_lossy()
            .to_string();
        let name = normalise_inner(&path_raw);

        if name.is_empty() || name == "." {
            continue;
        }

        let is_under_parent = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_under_parent || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path
            .rsplit('/')
            .next()
            .unwrap_or(&child_path)
            .to_string();

        let is_dir = entry.header().entry_type().is_dir()
            || entry.header().entry_type() == tar::EntryType::Symlink && false;

        let modified = entry
            .header()
            .mtime()
            .unwrap_or(0) as i64;

        if child_path == name {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.header().size().unwrap_or(0),
                compressed_size: 0,
                modified,
                compression: format.to_string(),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: format.to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: format.to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// 7Z listing
// ============================================================================

#[cfg(feature = "sevenz")]
pub fn list_7z(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use sevenz_rust::Archive as SevenZArchive;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = SevenZArchive::read(file)
        .context("Not a valid 7z archive")?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry in archive.entries() {
        let name = normalise_inner(&entry.name);
        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

        if child_path == name {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path.clone(),
                entry_type: if entry.is_directory() {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                modified: entry.last_modified().unwrap_or(0) as i64,
                compression: "7z".to_string(),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "7z".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::SevenZip.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// RAR listing
// ============================================================================

#[cfg(feature = "rar")]
pub fn list_rar(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use rar::Archive as RarArchive;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = RarArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid RAR archive: {}", e))?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry in archive.entries() {
        let entry = entry.map_err(|e| anyhow::anyhow!("Error reading RAR entry: {}", e))?;
        let name = normalise_inner(&entry.filename.to_string_lossy());
        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

        if child_path == name {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if entry.is_directory() {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.unpacked_size(),
                compressed_size: entry.packed_size(),
                modified: entry.last_modified().map(|t| t.timestamp()).unwrap_or(0),
                compression: format!("{:?}", entry.compression()),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "RAR".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Rar.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// CAB listing
// ============================================================================

#[cfg(feature = "cab")]
pub fn list_cab(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use cab::Cabinet;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = Cabinet::new(file)
        .context("Not a valid CAB archive")?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for folder in archive.folder_entries() {
        for file in folder.file_entries() {
            let name = normalise_inner(file.name());
            if name.is_empty() {
                continue;
            }

            let is_child = if parent.is_empty() {
                true
            } else {
                name == parent || name.starts_with(&format!("{}/", parent))
            };

            if !is_child || name == parent {
                continue;
            }

            let child_path = direct_child_path(&name, &parent);
            let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

            if child_path == name {
                seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                    name: child_name,
                    inner_path: child_path,
                    entry_type: ArchiveEntryType::File,
                    size: file.uncompressed_size(),
                    compressed_size: file.compressed_size(),
                    modified: 0,
                    compression: format!("{:?}", folder.compression_type()),
                });
            }
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| a.name.cmp(&b.name));

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Cab.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// ARJ listing
// ============================================================================

#[cfg(feature = "arj")]
pub fn list_arj(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use arj::Archive as ArjArchive;
    use std::fs::File;
    use std::io::BufReader;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    let mut reader = BufReader::new(file);
    
    let mut archive = ArjArchive::new(&mut reader)
        .map_err(|e| anyhow::anyhow!("Not a valid ARJ archive: {}", e))?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry_result in archive.entries() {
        let entry = entry_result
            .map_err(|e| anyhow::anyhow!("Error reading ARJ entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

        if child_path == name {
            let is_dir = entry.is_directory();
            
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                modified: entry.last_modified().map(|t| t.timestamp()).unwrap_or(0),
                compression: format!("ARJ {:?}", entry.compression_method()),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "ARJ".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Arj.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// LZH listing
// ============================================================================

#[cfg(feature = "lzh")]
pub fn list_lzh(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use lzh::LzhArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let archive = LzhArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid LZH archive: {}", e))?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry in archive.entries() {
        let entry = entry
            .map_err(|e| anyhow::anyhow!("Error reading LZH entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

        if child_path == name {
            let is_dir = entry.is_directory();
            
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                modified: entry.last_modified().map(|t| t.timestamp()).unwrap_or(0),
                compression: format!("LZH {:?}", entry.compression_method()),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "LZH".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Lzh.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// ACE listing
// ============================================================================

#[cfg(feature = "ace")]
pub fn list_ace(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    use ace::AceArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let archive = AceArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid ACE archive: {}", e))?;
    
    let parent = normalise_inner(inner_path);
    let mut seen: HashMap<String, ArchiveEntry> = HashMap::new();

    for entry in archive.entries() {
        let entry = entry
            .map_err(|e| anyhow::anyhow!("Error reading ACE entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() {
            continue;
        }

        let is_child = if parent.is_empty() {
            true
        } else {
            name == parent || name.starts_with(&format!("{}/", parent))
        };

        if !is_child || name == parent {
            continue;
        }

        let child_path = direct_child_path(&name, &parent);
        let child_name = child_path.rsplit('/').next().unwrap_or(&child_path).to_string();

        if child_path == name {
            let is_dir = entry.is_directory();
            
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                modified: entry.last_modified().map(|t| t.timestamp()).unwrap_or(0),
                compression: format!("ACE {:?}", entry.compression_method()),
            });
        } else {
            seen.entry(child_path.clone()).or_insert_with(|| ArchiveEntry {
                name: child_name,
                inner_path: child_path,
                entry_type: ArchiveEntryType::Directory,
                size: 0,
                compressed_size: 0,
                modified: 0,
                compression: "ACE".to_string(),
            });
        }
    }

    let mut entries: Vec<ArchiveEntry> = seen.into_values().collect();
    entries.sort_by(|a, b| {
        let ord = matches!(b.entry_type, ArchiveEntryType::Directory)
            .cmp(&matches!(a.entry_type, ArchiveEntryType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    let total_size = entries.iter().map(|e| e.size).sum();

    Ok(ArchiveListing {
        archive_path: archive_path.to_string(),
        inner_path: parent,
        format: ArchiveFormat::Ace.as_str().to_string(),
        entries,
        total_size,
    })
}

// ============================================================================
// Read archive file contents (existing)
// ============================================================================

pub fn read_zip_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    let mut zip = zip::ZipArchive::new(file).context("Not a valid ZIP archive")?;

    let target = normalise_inner(inner_path);
    let mut entry = zip.by_name(&target)
        .or_else(|_| zip.by_name(&format!("{}/", target)))
        .with_context(|| format!("Entry '{target}' not found in ZIP"))?;

    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).context("Error reading ZIP entry")?;
    Ok(buf)
}

pub fn read_tar_file<R: Read>(
    mut archive: tar::Archive<R>,
    inner_path: &str,
) -> Result<Vec<u8>> {
    let target = normalise_inner(inner_path);
    for entry_result in archive.entries().context("Error iterating TAR")? {
        let mut entry = entry_result.context("Error reading TAR entry")?;
        let path_raw = entry
            .path()
            .context("Invalid path")?
            .to_string_lossy()
            .to_string();
        if normalise_inner(&path_raw) == target {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).context("Error reading TAR entry data")?;
            return Ok(buf);
        }
    }
    bail!("Entry '{inner_path}' not found in archive");
}

#[cfg(feature = "sevenz")]
pub fn read_7z_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use sevenz_rust::Archive as SevenZArchive;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = SevenZArchive::read(file)
        .context("Not a valid 7z archive")?;
    
    let target = normalise_inner(inner_path);
    for entry in archive.entries() {
        if normalise_inner(&entry.name) == target {
            let mut buf = Vec::new();
            entry.read(&mut buf)?;
            return Ok(buf);
        }
    }
    bail!("Entry '{inner_path}' not found in 7z archive");
}

#[cfg(feature = "rar")]
pub fn read_rar_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use rar::Archive as RarArchive;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = RarArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid RAR archive: {}", e))?;
    
    let target = normalise_inner(inner_path);
    for entry in archive.entries() {
        let entry = entry.map_err(|e| anyhow::anyhow!("Error reading RAR entry: {}", e))?;
        if normalise_inner(&entry.filename.to_string_lossy()) == target {
            let mut buf = Vec::new();
            entry.read(&mut buf)?;
            return Ok(buf);
        }
    }
    bail!("Entry '{inner_path}' not found in RAR archive");
}

#[cfg(feature = "cab")]
pub fn read_cab_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use cab::Cabinet;
    
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = Cabinet::new(file)
        .context("Not a valid CAB archive")?;
    
    let target = normalise_inner(inner_path);
    let mut buf = Vec::new();
    archive.read_file(&target, &mut buf)
        .with_context(|| format!("Entry '{target}' not found in CAB archive"))?;
    Ok(buf)
}

#[cfg(feature = "arj")]
pub fn read_arj_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use arj::Archive as ArjArchive;
    use std::fs::File;
    use std::io::BufReader;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    let mut reader = BufReader::new(file);
    
    let mut archive = ArjArchive::new(&mut reader)
        .map_err(|e| anyhow::anyhow!("Not a valid ARJ archive: {}", e))?;
    
    let target = normalise_inner(inner_path);
    
    for entry_result in archive.entries() {
        let mut entry = entry_result
            .map_err(|e| anyhow::anyhow!("Error reading ARJ entry: {}", e))?;
        
        if normalise_inner(&entry.filename().to_string_lossy()) == target {
            let mut buf = Vec::new();
            entry.read(&mut buf)
                .map_err(|e| anyhow::anyhow!("Error reading ARJ entry data: {}", e))?;
            return Ok(buf);
        }
    }
    
    bail!("Entry '{inner_path}' not found in ARJ archive");
}

#[cfg(feature = "lzh")]
pub fn read_lzh_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use lzh::LzhArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = LzhArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid LZH archive: {}", e))?;
    
    let target = normalise_inner(inner_path);
    
    for entry in archive.entries() {
        let mut entry = entry
            .map_err(|e| anyhow::anyhow!("Error reading LZH entry: {}", e))?;
        
        if normalise_inner(&entry.filename().to_string_lossy()) == target {
            let mut buf = Vec::new();
            entry.read(&mut buf)
                .map_err(|e| anyhow::anyhow!("Error reading LZH entry data: {}", e))?;
            return Ok(buf);
        }
    }
    
    bail!("Entry '{inner_path}' not found in LZH archive");
}

#[cfg(feature = "ace")]
pub fn read_ace_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    use ace::AceArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)
        .with_context(|| format!("Cannot open {archive_path}"))?;
    
    let mut archive = AceArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid ACE archive: {}", e))?;
    
    let target = normalise_inner(inner_path);
    
    for entry in archive.entries() {
        let mut entry = entry
            .map_err(|e| anyhow::anyhow!("Error reading ACE entry: {}", e))?;
        
        if normalise_inner(&entry.filename().to_string_lossy()) == target {
            let mut buf = Vec::new();
            entry.read(&mut buf)
                .map_err(|e| anyhow::anyhow!("Error reading ACE entry data: {}", e))?;
            return Ok(buf);
        }
    }
    
    bail!("Entry '{inner_path}' not found in ACE archive");
}

// ============================================================================
// Public dispatch: list_archive (updated with new formats)
// ============================================================================

pub fn list_archive(archive_path: &str, inner_path: &str) -> Result<ArchiveListing> {
    let fmt = ArchiveFormat::detect(archive_path)
        .with_context(|| format!("Unrecognised archive format: {archive_path}"))?;

    match fmt {
        // Existing formats
        ArchiveFormat::Zip => list_zip(archive_path, inner_path),

        ArchiveFormat::Tar => {
            let f = std::fs::File::open(archive_path)?;
            list_tar_reader(tar::Archive::new(f), archive_path, inner_path, "tar")
        }

        ArchiveFormat::TarGz => {
            let f = std::fs::File::open(archive_path)?;
            let gz = flate2::read::GzDecoder::new(f);
            list_tar_reader(tar::Archive::new(gz), archive_path, inner_path, "tar.gz")
        }

        ArchiveFormat::TarBz2 => {
            let f = std::fs::File::open(archive_path)?;
            let bz = bzip2::read::BzDecoder::new(f);
            list_tar_reader(tar::Archive::new(bz), archive_path, inner_path, "tar.bz2")
        }

        ArchiveFormat::TarXz => {
            let f = std::fs::File::open(archive_path)?;
            let xz = xz2::read::XzDecoder::new(f);
            list_tar_reader(tar::Archive::new(xz), archive_path, inner_path, "tar.xz")
        }

        ArchiveFormat::TarZst => {
            let f = std::fs::File::open(archive_path)?;
            let zst = zstd::Decoder::new(f).context("zstd decoder error")?;
            list_tar_reader(tar::Archive::new(zst), archive_path, inner_path, "tar.zst")
        }

        ArchiveFormat::Gz | ArchiveFormat::Bz2 | ArchiveFormat::Xz | ArchiveFormat::Zst => {
            // Single-file compressed – present as a single-entry listing
            let stem = Path::new(archive_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file")
                .to_string();

            let file_size = std::fs::metadata(archive_path)?.len();

            let entry = ArchiveEntry {
                name: stem.clone(),
                inner_path: stem,
                entry_type: ArchiveEntryType::File,
                size: file_size,
                compressed_size: file_size,
                modified: 0,
                compression: fmt.as_str().to_string(),
            };

            Ok(ArchiveListing {
                archive_path: archive_path.to_string(),
                inner_path: String::new(),
                format: fmt.as_str().to_string(),
                entries: vec![entry],
                total_size: file_size,
            })
        }
        
        // New formats
        #[cfg(feature = "sevenz")]
        ArchiveFormat::SevenZip => list_7z(archive_path, inner_path),
        
        #[cfg(feature = "rar")]
        ArchiveFormat::Rar => list_rar(archive_path, inner_path),
        
        #[cfg(feature = "cab")]
        ArchiveFormat::Cab => list_cab(archive_path, inner_path),
        
        #[cfg(feature = "arj")]
        ArchiveFormat::Arj => list_arj(archive_path, inner_path),
        
        #[cfg(feature = "lzh")]
        ArchiveFormat::Lzh => list_lzh(archive_path, inner_path),
        
        #[cfg(feature = "ace")]
        ArchiveFormat::Ace => list_ace(archive_path, inner_path),
        
        // Fallback for when features are disabled
        ArchiveFormat::SevenZip | ArchiveFormat::Rar | ArchiveFormat::Cab 
        | ArchiveFormat::Arj | ArchiveFormat::Lzh | ArchiveFormat::Ace => {
            bail!("Support for {} format not compiled in", fmt.as_str())
        }
    }
}

// ============================================================================
// Public dispatch: read_archive_file (updated with new formats)
// ============================================================================

pub fn read_archive_file(archive_path: &str, inner_path: &str) -> Result<Vec<u8>> {
    let fmt = ArchiveFormat::detect(archive_path)
        .with_context(|| format!("Unrecognised archive format: {archive_path}"))?;

    match fmt {
        // Existing formats
        ArchiveFormat::Zip => read_zip_file(archive_path, inner_path),

        ArchiveFormat::Tar => {
            let f = std::fs::File::open(archive_path)?;
            read_tar_file(tar::Archive::new(f), inner_path)
        }

        ArchiveFormat::TarGz => {
            let f = std::fs::File::open(archive_path)?;
            let gz = flate2::read::GzDecoder::new(f);
            read_tar_file(tar::Archive::new(gz), inner_path)
        }

        ArchiveFormat::TarBz2 => {
            let f = std::fs::File::open(archive_path)?;
            let bz = bzip2::read::BzDecoder::new(f);
            read_tar_file(tar::Archive::new(bz), inner_path)
        }

        ArchiveFormat::TarXz => {
            let f = std::fs::File::open(archive_path)?;
            let xz = xz2::read::XzDecoder::new(f);
            read_tar_file(tar::Archive::new(xz), inner_path)
        }

        ArchiveFormat::TarZst => {
            let f = std::fs::File::open(archive_path)?;
            let zst = zstd::Decoder::new(f)?;
            read_tar_file(tar::Archive::new(zst), inner_path)
        }

        ArchiveFormat::Gz => {
            let f = std::fs::File::open(archive_path)?;
            let mut gz = flate2::read::GzDecoder::new(f);
            let mut buf = Vec::new();
            gz.read_to_end(&mut buf)?;
            Ok(buf)
        }

        ArchiveFormat::Bz2 => {
            let f = std::fs::File::open(archive_path)?;
            let mut bz = bzip2::read::BzDecoder::new(f);
            let mut buf = Vec::new();
            bz.read_to_end(&mut buf)?;
            Ok(buf)
        }

        ArchiveFormat::Xz => {
            let f = std::fs::File::open(archive_path)?;
            let mut xz = xz2::read::XzDecoder::new(f);
            let mut buf = Vec::new();
            xz.read_to_end(&mut buf)?;
            Ok(buf)
        }

        ArchiveFormat::Zst => {
            let f = std::fs::File::open(archive_path)?;
            let mut zst = zstd::Decoder::new(f)?;
            let mut buf = Vec::new();
            zst.read_to_end(&mut buf)?;
            Ok(buf)
        }
        
        // New formats
        #[cfg(feature = "sevenz")]
        ArchiveFormat::SevenZip => read_7z_file(archive_path, inner_path),
        
        #[cfg(feature = "rar")]
        ArchiveFormat::Rar => read_rar_file(archive_path, inner_path),
        
        #[cfg(feature = "cab")]
        ArchiveFormat::Cab => read_cab_file(archive_path, inner_path),
        
        #[cfg(feature = "arj")]
        ArchiveFormat::Arj => read_arj_file(archive_path, inner_path),

        #[cfg(feature = "lzh")]
        ArchiveFormat::Lzh => read_lzh_file(archive_path, inner_path),

        #[cfg(feature = "ace")]
        ArchiveFormat::Ace => read_ace_file(archive_path, inner_path),
    }
}

// ============================================================================
// Public dispatch: extract_archive (updated with new formats)
// ============================================================================

pub fn extract_archive(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    let fmt = ArchiveFormat::detect(archive_path)
        .with_context(|| format!("Unrecognised archive format: {archive_path}"))?;

    std::fs::create_dir_all(destination)
        .with_context(|| format!("Cannot create destination: {destination}"))?;

    match fmt {
        // Existing formats
        ArchiveFormat::Zip => extract_zip(archive_path, destination, inner_paths),
        
        ArchiveFormat::Tar => {
            let f = std::fs::File::open(archive_path)?;
            extract_tar(tar::Archive::new(f), destination, inner_paths)
        }
        
        ArchiveFormat::TarGz => {
            let f = std::fs::File::open(archive_path)?;
            extract_tar(tar::Archive::new(flate2::read::GzDecoder::new(f)), destination, inner_paths)
        }
        
        ArchiveFormat::TarBz2 => {
            let f = std::fs::File::open(archive_path)?;
            extract_tar(tar::Archive::new(bzip2::read::BzDecoder::new(f)), destination, inner_paths)
        }
        
        ArchiveFormat::TarXz => {
            let f = std::fs::File::open(archive_path)?;
            extract_tar(tar::Archive::new(xz2::read::XzDecoder::new(f)), destination, inner_paths)
        }
        
        ArchiveFormat::TarZst => {
            let f = std::fs::File::open(archive_path)?;
            extract_tar(tar::Archive::new(zstd::Decoder::new(f)?), destination, inner_paths)
        }
        
        ArchiveFormat::Gz | ArchiveFormat::Bz2 | ArchiveFormat::Xz | ArchiveFormat::Zst => {
            // Single-file: decompress to destination/stem
            let stem = Path::new(archive_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("output")
                .to_string();
            let out_path = Path::new(destination).join(&stem);
            let data = read_archive_file(archive_path, &stem)?;
            std::fs::write(&out_path, &data)?;
            Ok(vec![out_path.to_string_lossy().to_string()])
        }
        
        // New formats - delegate to specific extractors
        #[cfg(feature = "sevenz")]
        ArchiveFormat::SevenZip => extract_7z(archive_path, destination, inner_paths),
        
        #[cfg(feature = "rar")]
        ArchiveFormat::Rar => extract_rar(archive_path, destination, inner_paths),
        
        #[cfg(feature = "cab")]
        ArchiveFormat::Cab => extract_cab(archive_path, destination, inner_paths),
        
        #[cfg(feature = "arj")]
        ArchiveFormat::Arj => extract_arj(archive_path, destination, inner_paths),

        #[cfg(feature = "lzh")]
        ArchiveFormat::Lzh => extract_lzh(archive_path, destination, inner_paths),

        #[cfg(feature = "ace")]
        ArchiveFormat::Ace => extract_ace(archive_path, destination, inner_paths),
    }
}

// ============================================================================
// Extraction helpers for existing formats
// ============================================================================

fn extract_zip(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    let file = std::fs::File::open(archive_path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut extracted = Vec::new();

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let name = normalise_inner(entry.name());
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut f = std::fs::File::create(&out)?;
            io::copy(&mut entry, &mut f)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

fn extract_tar<R: Read>(mut archive: tar::Archive<R>, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    let mut extracted = Vec::new();

    for entry_result in archive.entries()? {
        let mut entry = entry_result?;
        let path_raw = entry.path()?.to_string_lossy().to_string();
        let name = normalise_inner(&path_raw);
        if name.is_empty() || name == "." { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut f = std::fs::File::create(&out)?;
            io::copy(&mut entry, &mut f)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

// ============================================================================
// New format extraction helpers
// ============================================================================

#[cfg(feature = "sevenz")]
fn extract_7z(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use sevenz_rust::Archive as SevenZArchive;
    
    let file = std::fs::File::open(archive_path)?;
    let mut archive = SevenZArchive::read(file)?;
    let mut extracted = Vec::new();

    for entry in archive.entries() {
        let name = normalise_inner(&entry.name);
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_directory() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            entry.read(&mut data)?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

#[cfg(feature = "rar")]
fn extract_rar(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use rar::Archive as RarArchive;
    
    let file = std::fs::File::open(archive_path)?;
    let mut archive = RarArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid RAR archive: {}", e))?;
    let mut extracted = Vec::new();

    for entry in archive.entries() {
        let mut entry = entry.map_err(|e| anyhow::anyhow!("Error reading RAR entry: {}", e))?;
        let name = normalise_inner(&entry.filename.to_string_lossy());
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_directory() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            entry.read(&mut data)?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

#[cfg(feature = "cab")]
fn extract_cab(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use cab::Cabinet;
    
    let file = std::fs::File::open(archive_path)?;
    let mut archive = Cabinet::new(file)?;
    let mut extracted = Vec::new();

    for folder in archive.folder_entries() {
        for file in folder.file_entries() {
            let name = normalise_inner(file.name());
            if name.is_empty() { continue; }

            if !inner_paths.is_empty() {
                let matches = inner_paths.iter().any(|p| {
                    let np = normalise_inner(p);
                    name == np || name.starts_with(&format!("{}/", np))
                });
                if !matches { continue; }
            }

            let out = Path::new(destination).join(&name);
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            archive.read_file(file.name(), &mut data)?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

// ============================================================================
// Extract ARJ
// ============================================================================

#[cfg(feature = "arj")]
fn extract_arj(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use arj::Archive as ArjArchive;
    use std::fs::File;
    use std::io::BufReader;
    
    let file = File::open(archive_path)?;
    let mut reader = BufReader::new(file);
    
    let mut archive = ArjArchive::new(&mut reader)
        .map_err(|e| anyhow::anyhow!("Not a valid ARJ archive: {}", e))?;
    let mut extracted = Vec::new();

    for entry_result in archive.entries() {
        let mut entry = entry_result
            .map_err(|e| anyhow::anyhow!("Error reading ARJ entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_directory() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            entry.read(&mut data)
                .map_err(|e| anyhow::anyhow!("Error reading ARJ entry data: {}", e))?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

// ============================================================================
// Extract LZH
// ============================================================================

#[cfg(feature = "lzh")]
fn extract_lzh(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use lzh::LzhArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)?;
    
    let mut archive = LzhArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid LZH archive: {}", e))?;
    let mut extracted = Vec::new();

    for entry_result in archive.entries() {
        let mut entry = entry_result
            .map_err(|e| anyhow::anyhow!("Error reading LZH entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_directory() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            entry.read(&mut data)
                .map_err(|e| anyhow::anyhow!("Error reading LZH entry data: {}", e))?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

// ============================================================================
// Extract ACE
// ============================================================================

#[cfg(feature = "ace")]
fn extract_ace(archive_path: &str, destination: &str, inner_paths: &[String]) -> Result<Vec<String>> {
    use ace::AceArchive;
    use std::fs::File;
    
    let file = File::open(archive_path)?;
    
    let mut archive = AceArchive::new(file)
        .map_err(|e| anyhow::anyhow!("Not a valid ACE archive: {}", e))?;
    let mut extracted = Vec::new();

    for entry_result in archive.entries() {
        let mut entry = entry_result
            .map_err(|e| anyhow::anyhow!("Error reading ACE entry: {}", e))?;
        
        let name = normalise_inner(&entry.filename().to_string_lossy());
        if name.is_empty() { continue; }

        if !inner_paths.is_empty() {
            let matches = inner_paths.iter().any(|p| {
                let np = normalise_inner(p);
                name == np || name.starts_with(&format!("{}/", np))
            });
            if !matches { continue; }
        }

        let out = Path::new(destination).join(&name);
        if entry.is_directory() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut data = Vec::new();
            entry.read(&mut data)
                .map_err(|e| anyhow::anyhow!("Error reading ACE entry data: {}", e))?;
            std::fs::write(&out, &data)?;
            extracted.push(out.to_string_lossy().to_string());
        }
    }
    Ok(extracted)
}

// ============================================================================
// is_archive helper (for Angular integration)
// ============================================================================

pub fn is_archive_extension(path: &str) -> bool {
    ArchiveFormat::detect(path).is_some()
}