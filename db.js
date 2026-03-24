const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        db.serialize(() => {
            // Guestbook
            db.run(`CREATE TABLE IF NOT EXISTS guestbook (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Tour Dates
            db.run(`CREATE TABLE IF NOT EXISTS tour_dates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                event_date DATE NOT NULL,
                is_past BOOLEAN DEFAULT 0,
                event_url TEXT,
                poster_url TEXT,
                location TEXT
            )`);

            // Gallery Photos
            db.run(`CREATE TABLE IF NOT EXISTS gallery_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                image_url TEXT NOT NULL,
                title TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Videos
            db.run(`CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtube_url TEXT NOT NULL,
                title TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Texts (for Bio, etc.)
            db.run(`CREATE TABLE IF NOT EXISTS texts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_section TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL
            )`);

            // Merch
            db.run(`CREATE TABLE IF NOT EXISTS merch (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                price REAL NOT NULL,
                image_url TEXT,
                description TEXT
            )`);

            // Users (Admin)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            )`, (err) => {
                if (!err) {
                    // Seed an initial admin user if the table is freshly created / empty
                    db.get(`SELECT COUNT(*) as count FROM users`, async (err, row) => {
                        if (!err && row.count === 0) {
                            const salt = await bcrypt.genSalt(10);
                            const hash = await bcrypt.hash('admin123', salt);
                            db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, ['admin', hash], (err) => {
                                if (!err) console.log('Created default admin user (admin / admin123)');
                            });
                        }
                    });
                }
            });

            console.log('Database tables ensured.');
        });
    }
});

module.exports = db;
