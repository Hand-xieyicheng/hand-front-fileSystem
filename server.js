const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 9000;

// 添加跨域支持
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 确保public文件夹存在
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 设置文件存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 从formData或query参数中获取dir参数
    let dir = '';
    if (req.body && req.body.dir) {
      dir = req.body.dir;
    }
    // 也支持通过query参数传递dir
    if (!dir && req.query && req.query.dir) {
      dir = req.query.dir;
    }
    
    // 标准化处理dir路径：去除首尾多余的斜杠
    const cleanDir = dir ? dir.trim().replace(/^\/+/, '').replace(/\/+$/, '') : '';
    // 拼接最终的上传目录
    const uploadDir = path.join(publicDir, cleanDir);
    
    // 确保上传目录存在（recursive: true 自动创建多级目录）
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 获取dir参数
    let dir = '';
    if (req.body && req.body.dir) {
      dir = req.body.dir;
    }
    if (!dir && req.query && req.query.dir) {
      dir = req.query.dir;
    }
    // 标准化dir路径
    const cleanDir = dir ? dir.trim().replace(/^\/+/, '').replace(/\/+$/, '') : '';
    const uploadDir = path.join(publicDir, cleanDir);
    
    // 1. 获取前端传递的fileName参数
    let customFileName = '';
    if (req.body && req.body.fileName) {
      customFileName = req.body.fileName.trim();
    }
    if (!customFileName && req.query && req.query.fileName) {
      customFileName = req.query.fileName.trim();
    }
    
    const originalName = file.originalname;
    const fileExt = path.extname(originalName); // 获取原文件扩展名
    
    let finalName;
    let fileNameWithoutExt;
    
    // 2. 判断是否使用自定义文件名
    if (customFileName) {
      // 检查自定义文件名是否包含扩展名
      const customExt = path.extname(customFileName);
      if (customExt) {
        // 如果自定义文件名带扩展名，直接使用
        fileNameWithoutExt = path.basename(customFileName, customExt);
        finalName = customFileName;
      } else {
        // 如果自定义文件名不带扩展名，拼接原文件扩展名
        fileNameWithoutExt = customFileName;
        finalName = `${customFileName}${fileExt}`;
      }
    } else {
      // 没有自定义文件名，使用原文件名
      fileNameWithoutExt = path.basename(originalName, fileExt);
      finalName = originalName;
    }
    
    // 3. 检查文件名是否已存在，避免重复（无论是否自定义文件名都要检查）
    let counter = 1;
    let tempName = finalName;
    while (fs.existsSync(path.join(uploadDir, tempName))) {
      const ext = path.extname(finalName);
      const nameWithoutExt = path.basename(finalName, ext);
      tempName = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    }
    finalName = tempName;
    
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

  const { dir, fileName } = req.body;
  // 标准化dir路径
  const cleanDir = dir ? dir.trim().replace(/^\/+/, '').replace(/\/+$/, '') : '';
  
  // 重新计算相对路径（适配动态目录）
  let relativePath = req.file.path.replace(publicDir, '').replace(/^\//, '');
  
  res.status(200).json({
    message: 'File uploaded successfully!',
    filename: req.file.filename, // 最终保存的文件名
    customFileName: fileName || '', // 前端传递的自定义文件名
    folder: cleanDir, // 返回标准化后的dir路径
    path: req.file.path, // 本地绝对路径
    relativePath: relativePath, // 相对于public的路径
    url: '/' +`${relativePath}`, // 可直接访问的URL
    dir: dir || '' // 返回前端传递的原始dir参数
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