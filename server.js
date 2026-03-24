const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'retro_intrepid_secret_90s',
    resave: false,
    saveUninitialized: false
}));

// Serve static assets from the WordPress export structure
app.use('/wp-content', express.static(path.join(__dirname, 'wp-content')));
app.use('/wp-includes', express.static(path.join(__dirname, 'wp-includes')));

// Helper to format dates for EJS
app.locals.formatDate = (dateString) => {
    const months = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
    const d = new Date(dateString);
    if (isNaN(d)) return dateString;
    return `${d.getDate().toString().padStart(2, '0')}. ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const https = require('https');

let fbEventsCache = [];
let lastFbFetch = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 mins

function getFbEvents() {
    return new Promise((resolve) => {
        if (Date.now() - lastFbFetch < CACHE_DURATION && fbEventsCache.length > 0) {
            return resolve(fbEventsCache);
        }
        const pageId = '276181566048578';
        const token = 'EAAWFgGTrwU8BQwkejp4LuFZC5aQJLM3L5ieZAjGYqhA1OmluRBHoigGznGCgShxZAXWAq7VizYTTnaaPZCK6uFiL1zevgtj8PwBL9ZAJpNG9kFlXFTG34zbL3rHNC65jPTKyQ2EKa2vxO3aD0sEK4PmBgf1Y6BqWZAHhPHZB709oWm7UDp1GJb9zsMSLKsBDW6IX4MC0u83QWsh';
        const url = `https://graph.facebook.com/v19.0/${pageId}/events?fields=id,name,start_time,cover&access_token=${token}&limit=100`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.data) {
                        fbEventsCache = json.data;
                        lastFbFetch = Date.now();
                        resolve(fbEventsCache);
                    } else resolve(fbEventsCache);
                } catch { resolve(fbEventsCache); }
            });
        }).on('error', () => resolve(fbEventsCache));
    });
}

// Routes
app.get('/', async (req, res) => {
    const events = await getFbEvents();
    const now = new Date().getTime();
    
    let upcoming = [];
    let past = [];
    
    events.forEach(ev => {
        const time = new Date(ev.start_time).getTime();
        if (time >= now) {
            upcoming.push(ev);
        } else {
            past.push(ev);
        }
    });
    
    // Sort
    upcoming.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    past.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    res.render('index', { upcomingEvents: upcoming, pastEvents: past });
});

app.get('/tour-dates', async (req, res) => {
    const events = await getFbEvents();
    const now = new Date().getTime();
    
    let upcoming = [];
    let past = [];
    
    events.forEach(ev => {
        const time = new Date(ev.start_time).getTime();
        if (time >= now) {
            upcoming.push(ev);
        } else {
            past.push(ev);
        }
    });
    
    upcoming.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    past.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    res.render('tour-dates', { upcomingEvents: upcoming, pastEvents: past });
});

app.get('/fotod', (req, res) => {
    db.all(`SELECT * FROM gallery_photos ORDER BY created_at DESC`, [], (err, rows) => {
        const categories = {};
        if (rows) {
            rows.forEach(row => {
                if (!categories[row.category]) categories[row.category] = [];
                categories[row.category].push(row);
            });
        }
        res.render('fotod', { categories });
    });
});
app.get('/videod', (req, res) => {
    db.all(`SELECT * FROM videos ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('videod', { videos: rows || [] });
    });
});
app.get('/biography', (req, res) => res.render('biography'));
app.get('/pood', (req, res) => {
    db.all(`SELECT * FROM merch`, [], (err, rows) => {
        res.render('pood', { merch: rows || [] });
    });
});

app.post('/pood', async (req, res) => {
    const { name, email, item, size, address } = req.body;
    try {
        let testAccount = await nodemailer.createTestAccount();
        let transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email", port: 587, secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        });
        let info = await transporter.sendMail({
            from: `"${name}" <${email}>`,
            to: "band@intrepid.com", 
            subject: `Uus Merch Tellimus: ${item}`,
            text: `Nimi: ${name}\nE-post: ${email}\nToode: ${item}\nSuurus: ${size}\nAadress: ${address}`,
        });
        console.log("Merch order sent: %s", nodemailer.getTestMessageUrl(info));
        res.redirect('/pood?success=1');
    } catch (error) {
        console.error(error);
        res.redirect('/pood?error=1');
    }
});
app.get('/kontakt', (req, res) => res.render('kontakt'));
app.get('/guestbook', (req, res) => {
    db.all(`SELECT * FROM guestbook ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('guestbook', { 
            comments: rows || [],
            error: req.query.error === 'captcha' ? 'reCAPTCHA valideerimine ebaõnnestus. Palun proovi uuesti!' : null
        });
    });
});

app.post('/guestbook', async (req, res) => {
    const { author, email, comment, 'g-recaptcha-response': recaptchaResponse } = req.body;
    
    // Test secret key for reCAPTCHA v2 (always passes) or substitute with real one:
    const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
    
    try {
        const fetch = require('node-fetch'); // Since node 18 fetch is native, wait, if older, we might need https directly. Let's use native fetch on node >18. Actually, the user's Node allows native fetch since previous fetch worked... wait, I used `https` module before. I will use `https` to be safe!
    } catch(e) {}

    const postData = `secret=${RECAPTCHA_SECRET}&response=${recaptchaResponse}`;
    const options = {
        hostname: 'www.google.com',
        path: '/recaptcha/api/siteverify',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const verifyReq = https.request(options, (verifyRes) => {
        let body = '';
        verifyRes.on('data', chunk => body += chunk);
        verifyRes.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                if (!parsed.success) {
                    return res.redirect('/guestbook?error=captcha');
                }
                
                // Success
                if (author && comment) {
                    const safeEmail = email || '';
                    db.run(`INSERT INTO guestbook (name, email, message) VALUES (?, ?, ?)`, [author, safeEmail, comment], (err) => {
                        res.redirect('/guestbook');
                    });
                } else {
                    res.redirect('/guestbook');
                }
            } catch (e) {
                return res.redirect('/guestbook?error=captcha');
            }
        });
    });

    verifyReq.on('error', () => res.redirect('/guestbook?error=captcha'));
    verifyReq.write(postData);
    verifyReq.end();
});

const nodemailer = require('nodemailer');
app.post('/kontakt', async (req, res) => {
    const { name, email, subject, message } = req.body;
    try {
        let testAccount = await nodemailer.createTestAccount();
        let transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        let info = await transporter.sendMail({
            from: `"${name}" <${email}>`,
            to: "band@intrepid.com", 
            subject: `Kontaktivorm: ${subject || 'Ilma teemata'}`,
            text: message,
        });

        console.log("Message sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        res.redirect('/kontakt?success=1');
    } catch (error) {
        console.error("Error sending email", error);
        res.redirect('/kontakt?error=1');
    }
});

// Start the server
// Admin Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/admin');
}

// Admin Routes
app.get('/admin', (req, res) => {
    if (req.session.userId) return res.redirect('/admin/dashboard');
    res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            return res.render('admin/login', { error: 'Invalid username or password' });
        }
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (isMatch) {
                req.session.userId = user.id;
                res.redirect('/admin/dashboard');
            } else {
                res.render('admin/login', { error: 'Invalid username or password' });
            }
        });
    });
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
});

app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    res.render('admin/dashboard');
});

// Admin Tour Dates
app.get('/admin/tour_dates', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM tour_dates ORDER BY date DESC`, [], (err, rows) => {
        res.render('admin/tour_dates', { tour_dates: rows || [] });
    });
});

app.post('/admin/tour_dates/add', isAuthenticated, (req, res) => {
    const { event_name, date, is_past, event_url, poster_url } = req.body;
    db.run(`INSERT INTO tour_dates (event_name, date, is_past, event_url, poster_url) VALUES (?, ?, ?, ?, ?)`, 
    [event_name, date, is_past ? 1 : 0, event_url, poster_url], (err) => {
        res.redirect('/admin/tour_dates');
    });
});

app.post('/admin/tour_dates/delete/:id', isAuthenticated, (req, res) => {
    db.run(`DELETE FROM tour_dates WHERE id = ?`, [req.params.id], (err) => {
        res.redirect('/admin/tour_dates');
    });
});

// Admin Videos
app.get('/admin/videos', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM videos ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('admin/videos', { videos: rows || [] });
    });
});

app.post('/admin/videos/add', isAuthenticated, (req, res) => {
    const { title, youtube_url } = req.body;
    db.run(`INSERT INTO videos (title, youtube_url) VALUES (?, ?)`, [title, youtube_url], (err) => {
        res.redirect('/admin/videos');
    });
});

app.post('/admin/videos/delete/:id', isAuthenticated, (req, res) => {
    db.run(`DELETE FROM videos WHERE id = ?`, [req.params.id], (err) => {
        res.redirect('/admin/videos');
    });
});

// Admin Merch
app.get('/admin/merch', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM merch ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('admin/merch', { merch: rows || [] });
    });
});

app.post('/admin/merch/add', isAuthenticated, (req, res) => {
    const { title, price, image_url } = req.body;
    db.run(`INSERT INTO merch (title, price, image_url) VALUES (?, ?, ?)`, [title, price, image_url], (err) => {
        res.redirect('/admin/merch');
    });
});

app.post('/admin/merch/delete/:id', isAuthenticated, (req, res) => {
    db.run(`DELETE FROM merch WHERE id = ?`, [req.params.id], (err) => {
        res.redirect('/admin/merch');
    });
});

// Admin Guestbook
app.get('/admin/guestbook', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM guestbook ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('admin/guestbook', { guestbook: rows || [] });
    });
});

app.post('/admin/guestbook/delete/:id', isAuthenticated, (req, res) => {
    db.run(`DELETE FROM guestbook WHERE id = ?`, [req.params.id], (err) => {
        res.redirect('/admin/guestbook');
    });
});

// Admin Photos
app.get('/admin/photos', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM gallery_photos ORDER BY created_at DESC`, [], (err, rows) => {
        res.render('admin/photos', { photos: rows || [] });
    });
});

app.post('/admin/photos/add', isAuthenticated, (req, res) => {
    const { category, image_url, title } = req.body;
    db.run(`INSERT INTO gallery_photos (category, image_url, title) VALUES (?, ?, ?)`, [category, image_url, title], (err) => {
        res.redirect('/admin/photos');
    });
});

app.post('/admin/photos/delete/:id', isAuthenticated, (req, res) => {
    db.run(`DELETE FROM gallery_photos WHERE id = ?`, [req.params.id], (err) => {
        res.redirect('/admin/photos');
    });
});

app.listen(PORT, () => {
    console.log(`Server is running locally at http://localhost:${PORT}`);
});
