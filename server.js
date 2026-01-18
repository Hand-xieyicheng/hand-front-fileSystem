const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 9000;

// 确保public文件夹存在
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 设置文件存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 使用自定义的方式从formData中获取folder参数
    // 在Multer中，req.body会包含除了文件字段之外的其他字段
    let folder = '';
    if (req.body && req.body.folder) {
      folder = req.body.folder;
    }
    // 也支持通过query参数传递folder
    if (!folder && req.query && req.query.folder) {
      folder = req.query.folder;
    }
    const uploadDir = path.join(publicDir, folder);
    
    // 确保上传目录存在
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 使用自定义的方式从formData中获取folder参数
    let folder = '';
    if (req.body && req.body.folder) {
      folder = req.body.folder;
    }
    if (!folder && req.query && req.query.folder) {
      folder = req.query.folder;
    }
    const uploadDir = path.join(publicDir, folder);
    const originalName = file.originalname;
    const fileExt = path.extname(originalName);
    const fileNameWithoutExt = path.basename(originalName, fileExt);
    
    // 检查文件名是否已存在，避免重复
    let finalName = originalName;
    let counter = 1;
    
    while (fs.existsSync(path.join(uploadDir, finalName))) {
      finalName = `${fileNameWithoutExt}_${counter}${fileExt}`;
      counter++;
    }
    
    cb(null, finalName);
  }
});

const upload = multer({ storage: storage });

// 暴露public文件夹为静态资源
app.use(express.static(publicDir));
// 解析请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 文件上传接口
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  
  // 获取实际的相对路径
  const relativePath = req.file.path.replace(publicDir, '').replace(/^\//, '');
  const folder = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';
  const fileUrl = `${req.protocol}://${req.get('host')}/${relativePath}`;
  
  res.status(200).json({
    message: 'File uploaded successfully!',
    filename: req.file.filename,
    folder: folder,
    path: req.file.path,
    relativePath: relativePath,
    url: fileUrl
  });
});

// 文件删除接口
app.delete('/files/:filePath(*)', (req, res) => {
  try {
    const filePath = path.join(publicDir, req.params.filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }
    
    // 检查是否为文件（不是文件夹）
    if (!fs.statSync(filePath).isFile()) {
      return res.status(400).json({ error: 'The path specified is not a file.' });
    }
    
    // 删除文件
    fs.unlinkSync(filePath);
    
    res.status(200).json({
      message: 'File deleted successfully!',
      filePath: req.params.filePath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 文件信息获取接口
app.get('/files/:filePath(*)', (req, res) => {
  try {
    const filePath = path.join(publicDir, req.params.filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }
    
    // 获取文件信息
    const stats = fs.statSync(filePath);
    const relativePath = req.params.filePath;
    const fileUrl = `${req.protocol}://${req.get('host')}/${relativePath}`;
    
    res.status(200).json({
      name: path.basename(filePath),
      path: filePath,
      relativePath: relativePath,
      url: fileUrl,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取文件列表接口（支持按文件夹筛选）
app.get('/files', (req, res) => {
  try {
    const folder = req.query.folder || '';
    const targetDir = path.join(publicDir, folder);
    
    // 检查目录是否存在
    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ error: 'Directory not found.' });
    }
    
    // 检查是否为目录
    if (!fs.statSync(targetDir).isDirectory()) {
      return res.status(400).json({ error: 'The path specified is not a directory.' });
    }
    
    const files = fs.readdirSync(targetDir);
    const fileList = files.map(file => {
      const filePath = path.join(targetDir, file);
      const stats = fs.statSync(filePath);
      const relativePath = folder ? `${folder}/${file}` : file;
      
      return {
        name: file,
        path: filePath,
        relativePath: relativePath,
        url: stats.isFile() ? `${req.protocol}://${req.get('host')}/${relativePath}` : null,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    });
    
    res.status(200).json({
      folder: folder,
      total: fileList.length,
      files: fileList
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'File storage server is running'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Public files available at http://localhost:${PORT}`);
  console.log(`Upload files to http://localhost:${PORT}/upload`);
  console.log(`Get file list at http://localhost:${PORT}/files`);
});
