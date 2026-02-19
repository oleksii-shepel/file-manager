use crate::protocol::*;
use anyhow::{Context, Result};
use chrono::Utc;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

// Import base64 Engine trait
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;

#[cfg(target_os = "windows")]
use winreg::enums::HKEY_LOCAL_MACHINE;
#[cfg(target_os = "windows")]
use winreg::RegKey;

// Move winapi imports inside the function where they're used
// or conditionally import them only when needed

pub struct CommandExecutor;

impl CommandExecutor {
    pub fn execute(command: Command) -> Response {
        let command_id = command.id().to_string();
        let timestamp = Utc::now().timestamp();

        let result = match command {
            Command::ListDirectory { path, show_hidden, .. } => {
                Self::list_directory(&path, show_hidden)
            }
            Command::ReadFile { path, encoding, .. } => {
                Self::read_file(&path, encoding.as_deref())
            }
            Command::WriteFile { path, content, encoding, .. } => {
                Self::write_file(&path, &content, encoding.as_deref())
            }
            Command::DeleteFile { path, recursive, .. } => {
                Self::delete_file(&path, recursive)
            }
            Command::CreateDirectory { path, recursive, .. } => {
                Self::create_directory(&path, recursive)
            }
            Command::MoveFile { source, destination, .. } => {
                Self::move_file(&source, &destination)
            }
            Command::CopyFile { source, destination, recursive, .. } => {
                Self::copy_file(&source, &destination, recursive)
            }
            Command::GetFileInfo { path, .. } => {
                Self::get_file_info(&path)
            }
            Command::SearchFiles { path, pattern, recursive, .. } => {
                Self::search_files(&path, &pattern, recursive)
            }
            Command::ListDrives { .. } => {
                Self::list_drives()
            }
            Command::GetOsInfo { .. } => {
                Self::get_os_info()
            }
            Command::ListArchive { archive_path, inner_path, .. } => {
                Self::list_archive(&archive_path, &inner_path)
            }
            Command::ReadArchiveFile { archive_path, inner_path, encoding, .. } => {
                Self::read_archive_file(&archive_path, &inner_path, encoding.as_deref())
            }
            Command::ExtractArchive { archive_path, destination, inner_paths, .. } => {
                Self::extract_archive(&archive_path, &destination, &inner_paths)
            }
        };

        match result {
            Ok(data) => Response::Success {
                command_id,
                timestamp,
                data,
            },
            Err(e) => Response::Error {
                command_id,
                timestamp,
                error: ErrorInfo {
                    code: "EXECUTION_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                },
            },
        }
    }

    // -------------------------------------------------------------------------
    // Path helpers
    // -------------------------------------------------------------------------

    /// On Windows, `std::fs::canonicalize` produces extended-length paths
    /// (`\\?\C:\...`).  We strip that prefix so callers always receive a
    /// normal drive-letter path such as `C:\Users\...`.
    /// On non-Windows platforms this is a no-op.
    fn normalize_path(path: &Path) -> String {
        let s = path.to_string_lossy();

        #[cfg(target_os = "windows")]
        {
            // Strip extended-length prefixes: \\?\ and \\?\UNC\
            if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
                return format!(r"\\{}", stripped);
            }
            if let Some(stripped) = s.strip_prefix(r"\\?\") {
                return stripped.to_string();
            }
        }

        s.into_owned()
    }

    /// Ensure an incoming path string is absolute.  On Windows this also
    /// validates that the path already carries a drive letter (e.g. `C:\`).
    /// If it does not, we prepend the system drive (typically `C:\`).
    fn resolve_path(path: &str) -> String {
        #[cfg(target_os = "windows")]
        {
            // Already has a drive letter (e.g. "C:\foo" or "C:/foo")
            let chars: Vec<char> = path.chars().collect();
            if chars.len() >= 2 && chars[1] == ':' {
                return path.replace('/', r"\");
            }
            // No drive letter — prepend the system drive
            let sys_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
            let rel = path.trim_start_matches(['/', '\\']);
            return format!(r"{}\{}", sys_drive, rel);
        }

        #[cfg(not(target_os = "windows"))]
        path.to_string()
    }

    // -------------------------------------------------------------------------
    // OS Info
    // -------------------------------------------------------------------------

    fn get_os_info() -> Result<ResponseData> {
        let os = std::env::consts::OS; // "windows", "linux", "macos", …
        let arch = std::env::consts::ARCH; // "x86_64", "aarch64", …

        let version = Self::os_version();
        
        #[cfg(target_os = "windows")]
        let hostname = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown".to_string());

        #[cfg(target_os = "linux")]
        let hostname = std::fs::read_to_string("/etc/hostname")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        #[cfg(target_os = "macos")]
        let hostname = std::process::Command::new("scutil")
            .arg("--get")
            .arg("ComputerName")
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
        let hostname = "unknown".to_string();

        #[cfg(target_os = "windows")]
        let system_drive = Some(
            std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string()) + r"\",
        );

        #[cfg(not(target_os = "windows"))]
        let system_drive = None;

        Ok(ResponseData::OsInfo(OsInfo {
            os: os.to_string(),
            version,
            arch: arch.to_string(),
            hostname,
            system_drive,
        }))
    }

    /// Best-effort OS version string.
    fn os_version() -> String {
        #[cfg(target_os = "windows")]
        {
            // Read from the registry: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion
            if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
            {
                let major: Result<u32, _> = hklm.get_value("CurrentMajorVersionNumber");
                let minor: Result<u32, _> = hklm.get_value("CurrentMinorVersionNumber");
                let build: Result<String, _> = hklm.get_value("CurrentBuildNumber");
                
                if let (Ok(major), Ok(minor), Ok(build)) = (major, minor, build) {
                    return format!("{}.{}.{}", major, minor, build);
                }
            }
            "unknown".to_string()
        }

        #[cfg(target_os = "linux")]
        {
            // Try /etc/os-release first, fall back to uname
            if let Ok(content) = fs::read_to_string("/etc/os-release") {
                for line in content.lines() {
                    if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
                        return val.trim_matches('"').to_string();
                    }
                }
            }
            Self::uname_version()
        }

        #[cfg(target_os = "macos")]
        {
            // sw_vers -productVersion
            if let Ok(out) = std::process::Command::new("sw_vers")
                .arg("-productVersion")
                .output()
            {
                return String::from_utf8_lossy(&out.stdout).trim().to_string();
            }
            Self::uname_version()
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
        {
            Self::uname_version()
        }
    }

    #[cfg(unix)]
    fn uname_version() -> String {
        if let Ok(out) = std::process::Command::new("uname").arg("-r").output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
        "unknown".to_string()
    }

    // -------------------------------------------------------------------------
    // List Drives
    // -------------------------------------------------------------------------

    #[cfg(target_os = "windows")]
    fn list_drives() -> Result<ResponseData> {
        // Import winapi items here, inside the function
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;
        use winapi::um::fileapi::{
            GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW,
        };
        use winapi::um::winbase::{
            DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOTE, DRIVE_REMOVABLE,
        };

        let mut buffer = vec![0u16; 256];
        let len = unsafe { GetLogicalDriveStringsW(buffer.len() as u32, buffer.as_mut_ptr()) };

        if len == 0 {
            anyhow::bail!("GetLogicalDriveStringsW failed");
        }

        let mut drives = Vec::new();
        let mut offset = 0usize;

        while offset < len as usize {
            let end = buffer[offset..]
                .iter()
                .position(|&c| c == 0)
                .map(|p| offset + p)
                .unwrap_or(len as usize);

            if end == offset {
                break;
            }

            let drive_wide = &buffer[offset..end];
            let drive_path = OsString::from_wide(drive_wide)
                .to_string_lossy()
                .into_owned();

            let drive_wide_nul: Vec<u16> = buffer[offset..=end].to_vec();

            let drive_type = unsafe { GetDriveTypeW(drive_wide_nul.as_ptr()) };

            let (total_space, free_space) = unsafe {
                let mut free = 0u64;
                let mut total = 0u64;
                let mut total_free = 0u64;
                let ok = GetDiskFreeSpaceExW(
                    drive_wide_nul.as_ptr(),
                    &mut free as *mut u64 as *mut _,
                    &mut total as *mut u64 as *mut _,
                    &mut total_free as *mut u64 as *mut _,
                );
                if ok != 0 { (total, free) } else { (0, 0) }
            };

            let drive_type_str = match drive_type {
                DRIVE_FIXED => "fixed",
                DRIVE_REMOVABLE => "removable",
                DRIVE_CDROM => "cdrom",
                DRIVE_RAMDISK => "ramdisk",
                DRIVE_REMOTE => "network",
                _ => "unknown",
            }
            .to_string();

            let name = drive_path.trim_end_matches('\\').to_string();

            drives.push(DriveInfo {
                name,
                path: drive_path,
                drive_type: drive_type_str,
                total_space,
                free_space,
                file_system: None,
            });

            offset = end + 1;
        }

        Ok(ResponseData::DrivesList(DrivesList { drives }))
    }

    #[cfg(not(target_os = "windows"))]
    fn list_drives() -> Result<ResponseData> {
        // Parse /proc/mounts on Linux; fall back to a single "/" root on macOS/other.
        let drives = Self::unix_mounts();
        Ok(ResponseData::DrivesList(DrivesList { drives }))
    }

    #[cfg(all(unix, target_os = "linux"))]
    fn unix_mounts() -> Vec<DriveInfo> {
        let content = match fs::read_to_string("/proc/mounts") {
            Ok(c) => c,
            Err(_) => return vec![Self::unix_root_drive()],
        };

        let mut drives = Vec::new();

        for line in content.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 6 {
                continue;
            }
            let device = parts[0];
            let mount_point = parts[1];
            let fs_type = parts[2];

            // Skip pseudo filesystems
            if matches!(
                fs_type,
                "proc" | "sysfs" | "devtmpfs" | "devpts" | "tmpfs"
                    | "cgroup" | "cgroup2" | "pstore" | "bpf" | "tracefs"
                    | "hugetlbfs" | "mqueue" | "debugfs" | "securityfs"
                    | "fusectl" | "configfs" | "efivarfs" | "overlay"
                    | "autofs" | "ramfs"
            ) {
                continue;
            }

            let (total_space, free_space) = Self::statvfs_space(mount_point);

            let name = if device.starts_with('/') {
                Path::new(device)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| device.to_string())
            } else {
                device.to_string()
            };

            drives.push(DriveInfo {
                name,
                path: mount_point.to_string(),
                drive_type: if fs_type == "vfat" || fs_type == "ntfs" {
                    "removable"
                } else if device.starts_with("/dev/sr") {
                    "cdrom"
                } else {
                    "fixed"
                }
                .to_string(),
                total_space,
                free_space,
                file_system: Some(fs_type.to_string()),
            });
        }

        if drives.is_empty() {
            drives.push(Self::unix_root_drive());
        }

        drives
    }

    #[cfg(all(unix, not(target_os = "linux")))]
    fn unix_mounts() -> Vec<DriveInfo> {
        // macOS / other Unix: just report root for now.
        vec![Self::unix_root_drive()]
    }

    #[cfg(unix)]
    fn unix_root_drive() -> DriveInfo {
        let (total, free) = Self::statvfs_space("/");
        DriveInfo {
            name: "root".to_string(),
            path: "/".to_string(),
            drive_type: "fixed".to_string(),
            total_space: total,
            free_space: free,
            file_system: None,
        }
    }

    /// Call `statvfs(2)` to get total/free bytes for a mount point.
    #[cfg(unix)]
    fn statvfs_space(path: &str) -> (u64, u64) {
        use std::mem::MaybeUninit;
        unsafe {
            let c_path = std::ffi::CString::new(path).unwrap();
            let mut stat: MaybeUninit<libc::statvfs> = MaybeUninit::uninit();
            if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
                let s = stat.assume_init();
                let total = s.f_blocks * s.f_frsize;
                let free = s.f_bavail * s.f_frsize;
                (total, free)
            } else {
                (0, 0)
            }
        }
    }

    // -------------------------------------------------------------------------
    // Directory / File operations
    // -------------------------------------------------------------------------

    fn list_directory(path: &str, show_hidden: bool) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        if !path_buf.is_dir() {
            anyhow::bail!("Path is not a directory: {}", path);
        }

        let mut entries = Vec::new();
        let mut total_size = 0u64;

        for entry in fs::read_dir(path_buf)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let name = entry.file_name().to_string_lossy().to_string();

            if !show_hidden && Self::is_hidden(&name, &metadata) {
                continue;
            }

            let file_info = Self::metadata_to_file_info(&name, &entry.path(), &metadata)?;
            total_size += file_info.size;
            entries.push(file_info);
        }

        entries.sort_by_key(|e| {
            let type_rank = match e.file_type {
                FileType::Directory => 0u8,
                FileType::Symlink => 1u8,
                FileType::File => 2u8,
            };
            (type_rank, e.name.to_lowercase(), e.name.clone())
        });

        Ok(ResponseData::DirectoryListing(DirectoryListing {
            path,
            entries,
            total_size,
        }))
    }

    fn read_file(path: &str, encoding: Option<&str>) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if !path_buf.exists() {
            anyhow::bail!("File does not exist: {}", path);
        }

        let metadata = fs::metadata(path_buf)?;
        let size = metadata.len();
        let encoding = encoding.unwrap_or("utf8");

        let content = match encoding {
            "utf8" => fs::read_to_string(path_buf)?,
            "base64" => {
                let bytes = fs::read(path_buf)?;
                BASE64_ENGINE.encode(&bytes)  // Use the constant with Engine trait
            }
            _ => anyhow::bail!("Unsupported encoding: {}", encoding),
        };

        Ok(ResponseData::FileContent(FileContent {
            path,
            content,
            encoding: encoding.to_string(),
            size,
        }))
    }

    fn write_file(path: &str, content: &str, encoding: Option<&str>) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);
        let encoding = encoding.unwrap_or("utf8");

        match encoding {
            "utf8" => fs::write(path_buf, content)?,
            "base64" => {
                let bytes = BASE64_ENGINE  // Use the constant with Engine trait
                    .decode(content)
                    .context("Failed to decode base64 content")?;
                fs::write(path_buf, bytes)?;
            }
            _ => anyhow::bail!("Unsupported encoding: {}", encoding),
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("File written successfully: {}", path)),
            affected_paths: Some(vec![path]),
        }))
    }

    fn delete_file(path: &str, recursive: bool) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        if path_buf.is_dir() {
            if recursive {
                fs::remove_dir_all(path_buf)?;
            } else {
                fs::remove_dir(path_buf)?;
            }
        } else {
            fs::remove_file(path_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Deleted: {}", path)),
            affected_paths: Some(vec![path]),
        }))
    }

    fn create_directory(path: &str, recursive: bool) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if recursive {
            fs::create_dir_all(path_buf)?;
        } else {
            fs::create_dir(path_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Directory created: {}", path)),
            affected_paths: Some(vec![path]),
        }))
    }

    fn move_file(source: &str, destination: &str) -> Result<ResponseData> {
        let source = Self::resolve_path(source);
        let destination = Self::resolve_path(destination);

        if !Path::new(&source).exists() {
            anyhow::bail!("Source does not exist: {}", source);
        }

        fs::rename(&source, &destination)?;

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Moved from {} to {}", source, destination)),
            affected_paths: Some(vec![source, destination]),
        }))
    }

    fn copy_file(source: &str, destination: &str, recursive: bool) -> Result<ResponseData> {
        let source = Self::resolve_path(source);
        let destination = Self::resolve_path(destination);
        let source_buf = Path::new(&source);
        let dest_buf = Path::new(&destination);

        if !source_buf.exists() {
            anyhow::bail!("Source does not exist: {}", source);
        }

        if source_buf.is_dir() {
            if !recursive {
                anyhow::bail!("Cannot copy directory without recursive flag");
            }
            Self::copy_dir_recursive(source_buf, dest_buf)?;
        } else {
            fs::copy(source_buf, dest_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Copied from {} to {}", source, destination)),
            affected_paths: Some(vec![destination]),
        }))
    }

    fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            if ty.is_dir() {
                Self::copy_dir_recursive(&src_path, &dst_path)?;
            } else {
                fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }

    fn get_file_info(path: &str) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        let metadata = fs::metadata(path_buf)?;
        let name = path_buf
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_info = Self::metadata_to_file_info(&name, path_buf, &metadata)?;
        Ok(ResponseData::FileInfo(file_info))
    }

    fn search_files(path: &str, pattern: &str, recursive: bool) -> Result<ResponseData> {
        let path = Self::resolve_path(path);
        let path_buf = Path::new(&path);

        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        let pattern_lower = pattern.to_lowercase();
        let mut matches = Vec::new();

        let walker = if recursive {
            WalkDir::new(path_buf)
        } else {
            WalkDir::new(path_buf).max_depth(1)
        };

        for entry in walker.into_iter().filter_map(|e| e.ok()) {
            let file_name = entry.file_name().to_string_lossy();
            if file_name.to_lowercase().contains(&pattern_lower) {
                if let Ok(metadata) = entry.metadata() {
                    let file_info =
                        Self::metadata_to_file_info(&file_name, entry.path(), &metadata)?;
                    matches.push(file_info);
                }
            }
        }

        let total_matches = matches.len();

        Ok(ResponseData::SearchResult(SearchResult {
            path,
            matches,
            total_matches,
        }))
    }

    // -------------------------------------------------------------------------
    // Archive operations
    // -------------------------------------------------------------------------

    fn list_archive(archive_path: &str, inner_path: &str) -> Result<ResponseData> {
        let listing = crate::archive::list_archive(archive_path, inner_path)?;
        Ok(ResponseData::ArchiveListing(listing))
    }

    fn read_archive_file(path: &str, inner: &str, encoding: Option<&str>) -> Result<ResponseData> {
        let bytes = crate::archive::read_archive_file(path, inner)?;
        let (content, enc) = match encoding {
            Some("base64") | None => (BASE64_ENGINE.encode(&bytes), "base64".to_string()),
            Some("utf8") => (String::from_utf8_lossy(&bytes).to_string(), "utf-8".to_string()),
            Some(e) => anyhow::bail!("Unsupported encoding: {}", e),
        };
        Ok(ResponseData::FileContent(FileContent {
            path: path.to_string(),
            content,
            encoding: enc,
            size: bytes.len() as u64,
        }))
    }

    fn extract_archive(path: &str, destination: &str, inner_paths: &[String]) -> Result<ResponseData> {
        let extracted = crate::archive::extract_archive(path, destination, inner_paths)?;
        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Extracted {} entries", extracted.len())),
            affected_paths: Some(extracted),
        }))
    }

    // -------------------------------------------------------------------------
    // Metadata helpers
    // -------------------------------------------------------------------------

    fn metadata_to_file_info(
        name: &str,
        path: &Path,
        metadata: &fs::Metadata,
    ) -> Result<FileInfo> {
        let file_type = if metadata.is_dir() {
            FileType::Directory
        } else if metadata.file_type().is_symlink() {
            FileType::Symlink
        } else {
            FileType::File
        };

        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let accessed = metadata
            .accessed()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        #[cfg(unix)]
        let permissions = format!("{:o}", metadata.permissions().mode() & 0o777);

        #[cfg(not(unix))]
        let permissions = if metadata.permissions().readonly() {
            "r--".to_string()
        } else {
            "rw-".to_string()
        };

        let is_hidden = Self::is_hidden(name, metadata);

        // Normalise path so Windows never returns \\?\ prefixes
        let path_str = Self::normalize_path(path);

        Ok(FileInfo {
            name: name.to_string(),
            path: path_str,
            file_type,
            size: metadata.len(),
            created,
            modified,
            accessed,
            permissions,
            is_hidden,
        })
    }

    /// A file is hidden when its name starts with `.` (Unix convention) or
    /// when the Windows hidden attribute is set.
    fn is_hidden(name: &str, _metadata: &fs::Metadata) -> bool {
        if name.starts_with('.') {
            return true;
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::fs::MetadataExt;
            // FILE_ATTRIBUTE_HIDDEN = 0x2
            if _metadata.file_attributes() & 0x2 != 0 {
                return true;
            }
        }

        false
    }
}