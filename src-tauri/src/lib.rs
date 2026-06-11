use base64::Engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![save_pdf])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Tauri 命令：使用原生保存对话框保存 PDF 文件
///
/// 在 Tauri WebView 中，jspdf 的 save() 方法（Blob URL + anchor download）
/// 无法触发浏览器下载，因此需要通过原生对话框保存文件。
///
/// 流程：
/// 1. Base64 解码前端传来的 PDF 数据
/// 2. 弹出原生文件保存对话框（tauri-plugin-dialog）
/// 3. 将解码后的二进制数据写入用户选择的路径
#[tauri::command]
fn save_pdf(app: tauri::AppHandle, data: String, filename: String) -> Result<(), String> {
  // 诊断：输出收到的数据摘要
  eprintln!(
    "[save_pdf] 收到请求: filename=\"{}\", base64_len={} bytes",
    filename,
    data.len()
  );

  // Base64 解码 PDF 数据
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(&data)
    .map_err(|e| {
      let msg = format!("PDF 数据解码失败：{}", e);
      eprintln!("[save_pdf] 错误: {}", msg);
      msg
    })?;

  eprintln!("[save_pdf] Base64 解码成功，PDF 大小: {} bytes", bytes.len());

  // 使用原生保存对话框
  use tauri_plugin_dialog::DialogExt;
  let path = app
    .dialog()
    .file()
    .add_filter("PDF 文件", &["pdf"])
    .set_file_name(format!("{}.pdf", filename))
    .blocking_save_file();

  // 用户取消保存
  let Some(path) = path else {
    eprintln!("[save_pdf] 用户取消了保存对话框");
    return Ok(());
  };

  eprintln!("[save_pdf] 用户选择了路径，正在写入文件...");

  // 写入文件：FilePath 没有 write 方法，需要匹配枚举变体提取路径
  let file_path = match &path {
    tauri_plugin_dialog::FilePath::Path(p) => p.clone(),
    tauri_plugin_dialog::FilePath::Url(url) => {
      // URL → 文件路径（Linux 桌面门户可能返回 URL）
      url
        .to_file_path()
        .map_err(|()| "文件路径无效：无法从 URL 转换为本地路径".to_string())?
    }
  };

  std::fs::write(&file_path, &bytes).map_err(|e| {
    let msg = format!("文件保存失败：{}", e);
    eprintln!("[save_pdf] 错误: {}", msg);
    msg
  })?;

  eprintln!("[save_pdf] 文件保存成功，路径: {:?}", file_path);
  Ok(())
}
