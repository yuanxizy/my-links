const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS links (
                id VARCHAR(50) PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                display_url TEXT NOT NULL,
                type VARCHAR(20) NOT NULL,
                created_at BIGINT NOT NULL
            )
        `);
        console.log('Database initialized');
    } finally {
        client.release();
    }
}

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

app.get('/api/links', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM links ORDER BY created_at DESC');
        const links = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            url: row.url,
            displayUrl: row.display_url,
            type: row.type,
            createdAt: row.created_at
        }));
        res.json(links);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/links', async (req, res) => {
    const newLink = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: req.body.title,
        url: req.body.url,
        displayUrl: req.body.displayUrl,
        type: req.body.type,
        createdAt: Date.now()
    };

    try {
        await pool.query(
            'INSERT INTO links (id, title, url, display_url, type, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [newLink.id, newLink.title, newLink.url, newLink.displayUrl, newLink.type, newLink.createdAt]
        );
        res.json(newLink);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/links/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM links WHERE id = $1', [req.params.id]);
        const linkToDelete = result.rows[0];
        
        if (linkToDelete && linkToDelete.type === 'file' && linkToDelete.url.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, linkToDelete.url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await pool.query('DELETE FROM links WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
