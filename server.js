const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

function decodeFilename(name) {
    if (!name) return name;
    try {
        if (decodeURIComponent(name) !== name) {
            return decodeURIComponent(name);
        }
        const bytes = [];
        for (let i = 0; i < name.length; i++) {
            bytes.push(name.charCodeAt(i) & 0xFF);
        }
        const buf = Buffer.from(bytes);
        const decoded = buf.toString('utf8');
        if (decoded && !decoded.includes('\uFFFD')) {
            return decoded;
        }
        return name;
    } catch (e) {
        return name;
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const decodedName = decodeFilename(file.originalname);
        const ext = path.extname(decodedName);
        const baseName = path.basename(decodedName, ext);
        const safeBaseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
        cb(null, uniqueSuffix + '_' + safeBaseName + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const originalName = decodeFilename(req.file.originalname);

    res.json({
        success: true,
        url: fileUrl,
        filename: originalName
    });
});

app.use('/uploads', express.static(uploadsDir));

app.get('/api/links', (req, res) => {
    const dataFile = path.join(__dirname, 'links.json');
    if (fs.existsSync(dataFile)) {
        const data = fs.readFileSync(dataFile, 'utf-8');
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

app.post('/api/links', (req, res) => {
    const dataFile = path.join(__dirname, 'links.json');
    let links = [];

    if (fs.existsSync(dataFile)) {
        const data = fs.readFileSync(dataFile, 'utf-8');
        links = JSON.parse(data);
    }

    const newLink = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: req.body.title,
        url: req.body.url,
        displayUrl: req.body.displayUrl,
        type: req.body.type,
        createdAt: Date.now()
    };

    links.unshift(newLink);

    fs.writeFileSync(dataFile, JSON.stringify(links, null, 2));
    res.json(newLink);
});

app.delete('/api/links/:id', (req, res) => {
    const dataFile = path.join(__dirname, 'links.json');
    let links = [];

    if (fs.existsSync(dataFile)) {
        const data = fs.readFileSync(dataFile, 'utf-8');
        links = JSON.parse(data);
    }

    const linkToDelete = links.find(l => l.id === req.params.id);
    if (linkToDelete && linkToDelete.type === 'file' && linkToDelete.url.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, linkToDelete.url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    links = links.filter(l => l.id !== req.params.id);
    fs.writeFileSync(dataFile, JSON.stringify(links, null, 2));
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
