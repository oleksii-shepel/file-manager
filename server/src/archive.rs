use anyhow::{anyhow, Context, Result};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::process::Command;

use crate::protocol::{ArchiveEntry, ArchiveEntryType, ArchiveListing};

// =======================
// Archive Format Detection
// =======================

#[derive(Debug, Clone, Copy)]
pub enum ArchiveFormat {
    Zip,
    SevenZip,
}

impl ArchiveFormat {
    pub fn detect(path: &str) -> Option<Self> {
        let lower = path.to_lowercase();
        if lower.ends_with(".zip") {
            Some(Self::Zip)
        } else if lower.ends_with(".7z") {
            Some(Self::SevenZip)
        } else {
            None
        }
    }
}

// =======================
// Backend Trait
// =======================

trait ArchiveBackend {
    fn read_file(path: &str, inner: &str) -> Result<Vec<u8>>;
    fn extract(path: &str, dest: &str, files: &[String]) -> Result<Vec<String>>;
    fn list(path: &str, inner: &str) -> Result<ArchiveListing>;
}

// =======================
// ZIP BACKEND
// =======================

struct ZipBackend;

impl ZipBackend {
    fn open_entry<'a>(
        zip: &'a mut zip::ZipArchive<File>,
        target: &str,
    ) -> Result<zip::read::ZipFile<'a>> {
        let name = if zip.file_names().any(|n| n == target) {
            target.to_string()
        } else {
            format!("{}/", target)
        };
        let file = zip
            .by_name(&name)
            .with_context(|| format!("Entry '{}' not found", target))?;
        Ok(file)
    }
}

impl ArchiveBackend for ZipBackend {
    fn read_file(path: &str, inner: &str) -> Result<Vec<u8>> {
        let file = File::open(path)?;
        let mut zip = zip::ZipArchive::new(file)?;
        let target = inner.replace('\\', "/");
        let mut entry = Self::open_entry(&mut zip, &target)?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        Ok(buf)
    }

    fn extract(path: &str, dest: &str, files: &[String]) -> Result<Vec<String>> {
        let file = File::open(path)?;
        let mut zip = zip::ZipArchive::new(file)?;
        let mut extracted = Vec::new();

        for name in files {
            let mut entry = Self::open_entry(&mut zip, name)?;
            let out_path = Path::new(dest).join(name);

            if entry.name().ends_with('/') {
                std::fs::create_dir_all(&out_path)?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut outfile = File::create(&out_path)?;
                std::io::copy(&mut entry, &mut outfile)?;
            }
            extracted.push(name.clone());
        }
        Ok(extracted)
    }

    fn list(path: &str, inner: &str) -> Result<ArchiveListing> {
        let file = File::open(path)?;
        let mut zip = zip::ZipArchive::new(file)?;
        let prefix = inner.replace('\\', "/");
        let prefix_norm = if prefix.is_empty() || prefix.ends_with('/') {
            prefix.clone()
        } else {
            format!("{}/", prefix)
        };

        let mut entries = Vec::new();

        for i in 0..zip.len() {
            let entry = zip.by_index(i)?;
            let raw_name = entry.name();
            let name = raw_name.replace('\\', "/");

            // Filter by inner path
            if !prefix.is_empty() && !name.starts_with(&prefix_norm) {
                continue;
            }

            // Determine inner path relative to listing root
            let rel_path = if prefix.is_empty() {
                name.clone()
            } else {
                name[prefix_norm.len()..].to_string()
            };

            // Skip if not direct child (for directory listing we want only immediate children)
            if rel_path.contains('/') {
                continue;
            }

            let is_dir = entry.is_dir();
            let size = entry.size();
            let compressed = entry.compressed_size();

            let dt = entry.last_modified();

            let modified =
                chrono::NaiveDate::from_ymd_opt(dt.year() as i32, dt.month() as u32, dt.day() as u32)
                    .and_then(|date| {
                        date.and_hms_opt(dt.hour() as u32, dt.minute() as u32, dt.second() as u32)
                    })
                    .map(|dt| dt.and_utc().timestamp())
                    .unwrap_or(0);

            let compression = format!("{:?}", entry.compression());

            let archive_entry = ArchiveEntry {
                name: rel_path.clone(),
                inner_path: rel_path,
                entry_type: if is_dir {
                    ArchiveEntryType::Directory
                } else {
                    ArchiveEntryType::File
                },
                size,
                compressed_size: compressed,
                modified,
                compression,
            };

            entries.push(archive_entry);
        }

        let total_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveListing {
            archive_path: path.to_string(),
            inner_path: prefix,
            format: "zip".to_string(),
            entries,
            total_size,
        })
    }
}

// =======================
// 7Z BACKEND
// =======================

struct SevenZipBackend;

impl ArchiveBackend for SevenZipBackend {
    fn read_file(path: &str, inner: &str) -> Result<Vec<u8>> {
        let output = Command::new("7z")
            .args(["x", "-so", path, inner])
            .output()?;

        if !output.status.success() {
            return Err(anyhow!(
                "7z failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(output.stdout)
    }

    fn extract(path: &str, dest: &str, files: &[String]) -> Result<Vec<String>> {
        let mut args = vec![
            "x".to_string(),
            "-y".to_string(),
            format!("-o{}", dest),
        ];
        args.push(path.to_string());
        args.extend(files.iter().cloned());

        let output = Command::new("7z").args(&args).output()?;

        if !output.status.success() {
            return Err(anyhow!(
                "7z extraction failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(files.to_vec())
    }

    fn list(path: &str, inner: &str) -> Result<ArchiveListing> {
        // Use detailed listing to get metadata
        let output = Command::new("7z")
            .args(["l", "-slt", path])
            .output()?;

        if !output.status.success() {
            return Err(anyhow!(
                "7z list failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let prefix = inner.replace('\\', "/");

        let mut entries = Vec::new();
        let mut current = None;
        let mut in_entry = false;

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                if let Some(entry_data) = current.take() {
                    if let Some(entry) = parse_7z_entry(entry_data, &prefix) {
                        entries.push(entry);
                    }
                }
                in_entry = false;
                continue;
            }

            if line.starts_with("----------") {
                in_entry = true;
                current = Some(Vec::new());
                continue;
            }

            if in_entry {
                if let Some(ref mut data) = current {
                    data.push(line.to_string());
                }
            }
        }

        // Handle last entry
        if let Some(entry_data) = current.take() {
            if let Some(entry) = parse_7z_entry(entry_data, &prefix) {
                entries.push(entry);
            }
        }

        // Filter to direct children of inner path
        let filtered: Vec<_> = entries
            .into_iter()
            .filter(|e| {
                if prefix.is_empty() {
                    !e.inner_path.contains('/')
                } else {
                    e.inner_path.starts_with(&format!("{}/", prefix))
                        && !e.inner_path[prefix.len() + 1..].contains('/')
                }
            })
            .collect();

        let total_size = filtered.iter().map(|e| e.size).sum();

        Ok(ArchiveListing {
            archive_path: path.to_string(),
            inner_path: prefix,
            format: "7z".to_string(),
            entries: filtered,
            total_size,
        })
    }
}

fn parse_7z_entry(lines: Vec<String>, prefix: &str) -> Option<ArchiveEntry> {
    let mut path = None;
    let mut size = 0;
    let mut compressed = 0;
    let mut modified = 0;
    let mut is_dir = false;

    for line in lines {
        if let Some((key, value)) = line.split_once(" = ") {
            match key {
                "Path" => path = Some(value.to_string()),
                "Size" => size = value.parse().unwrap_or(0),
                "Packed Size" => compressed = value.parse().unwrap_or(0),
                "Modified" => {
                    if let Ok(dt) = chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
                        modified = dt.timestamp();
                    }
                }
                "Folder" => is_dir = value == "+",
                _ => {}
            }
        }
    }

    let full_path = path?;
    let name = full_path.split('/').last().unwrap_or(&full_path).to_string();
    let inner_path = full_path.replace('\\', "/");

    // Skip if not under prefix
    if !prefix.is_empty() && !inner_path.starts_with(&format!("{}/", prefix)) && inner_path != *prefix {
        return None;
    }

    Some(ArchiveEntry {
        name,
        inner_path,
        entry_type: if is_dir {
            ArchiveEntryType::Directory
        } else {
            ArchiveEntryType::File
        },
        size,
        compressed_size: compressed,
        modified,
        compression: "7z".to_string(),
    })
}

// =======================
// Public API
// =======================

pub fn read_archive_file(path: &str, inner: &str) -> Result<Vec<u8>> {
    let fmt = ArchiveFormat::detect(path)
        .ok_or_else(|| anyhow!("Unsupported archive format"))?;

    match fmt {
        ArchiveFormat::Zip => ZipBackend::read_file(path, inner),
        ArchiveFormat::SevenZip => SevenZipBackend::read_file(path, inner),
    }
}

pub fn extract_archive(path: &str, dest: &str, files: &[String]) -> Result<Vec<String>> {
    let fmt = ArchiveFormat::detect(path)
        .ok_or_else(|| anyhow!("Unsupported archive format"))?;

    match fmt {
        ArchiveFormat::Zip => ZipBackend::extract(path, dest, files),
        ArchiveFormat::SevenZip => SevenZipBackend::extract(path, dest, files),
    }
}

pub fn list_archive(path: &str, inner: &str) -> Result<ArchiveListing> {
    let fmt = ArchiveFormat::detect(path)
        .ok_or_else(|| anyhow!("Unsupported archive format"))?;

    match fmt {
        ArchiveFormat::Zip => ZipBackend::list(path, inner),
        ArchiveFormat::SevenZip => SevenZipBackend::list(path, inner),
    }
}