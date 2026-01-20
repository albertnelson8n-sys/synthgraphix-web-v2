const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "..", "data.sqlite");

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");
  await run("PRAGMA journal_mode = WAL");

  // Lightweight key/value config store (editable from Admin)
  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,

      referral_code TEXT UNIQUE,
      referred_by INTEGER,

      balance_ksh INTEGER NOT NULL DEFAULT 0,
      bonus_ksh   INTEGER NOT NULL DEFAULT 0,

      full_name TEXT,
      phone TEXT,
      payment_number TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      delete_requested_at TEXT,
      delete_effective_at TEXT,

      FOREIGN KEY (referred_by) REFERENCES users(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- canonical task type/category
      type TEXT NOT NULL,
      category TEXT NOT NULL,

      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,

      -- media URL + legacy alias "image"
      media_url TEXT,
      image TEXT,

      reward_ksh INTEGER NOT NULL,
      complexity INTEGER NOT NULL,

      active INTEGER NOT NULL DEFAULT 1
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      reward_ksh INTEGER NOT NULL,
      answer_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      task_id INTEGER NOT NULL,

      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      answer_text TEXT,

      UNIQUE(user_id, day_key, task_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "pending",
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activation_fees (
      user_id INTEGER PRIMARY KEY,
      fee_ksh INTEGER NOT NULL DEFAULT 100,
      paid_ksh INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      paid_at TEXT,
      -- payment provider tracking (Pesapal)
      provider TEXT,
      provider_order_tracking_id TEXT,
      provider_merchant_reference TEXT,
      provider_status TEXT,
      provider_raw_json TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );
  `);

  // Seed default settings (idempotent)
  const defaults = [
    ["activation_fee_ksh", "100"],
    ["tasks_per_day", "10"],
    ["referral_bonus_ksh", "100"],
    ["min_withdraw_ksh", "200"],
    ["referral_redeem_threshold_ksh", "1000"],
    ["referral_redeem_transfer_ksh", "1000"],
  ];
  for (const [k, v] of defaults) {
    await run("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", [k, v]);
  }


  // seed tasks if empty
  const c = await get("SELECT COUNT(*) AS n FROM tasks");
  const hasTasks = (c?.n || 0) > 0;

  const MEDIA = {
    audio: [
      "https://upload.wikimedia.org/wikipedia/commons/4/4f/En-us-hello.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/7/7e/En-us-thank_you.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/9/9e/En-us-yes.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/1/12/En-us-no.ogg"
    ],
    video: [
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/86/Big_Buck_Bunny_Trailer_400p.ogv/Big_Buck_Bunny_Trailer_400p.ogv.480p.vp9.webm",
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/63/Wikipedia_Edit_2014.webm/Wikipedia_Edit_2014.webm.480p.vp9.webm",
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Walking_in_Tokyo.webm/Walking_in_Tokyo.webm.480p.vp9.webm"
    ],
    image: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/640px-Cat03.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Golden_Retriever_medium-to-light-coat.jpg/640px-Golden_Retriever_medium-to-light-coat.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/New_york_times_square-terabass.jpg/640px-New_york_times_square-terabass.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Example.svg/640px-Example.svg.png"
    ]
  };

  // Expanded catalog to make the platform feel richer.
  const TYPES = [
    { type: "audio_transcription", media: "audio", base: 10, max: 18 },
    { type: "video_transcription", media: "video", base: 18, max: 30 },
    { type: "image_caption", media: "image", base: 12, max: 22 },
    { type: "image_tagging", media: "image", base: 10, max: 18 },
    { type: "text_cleanup", media: null, base: 10, max: 16 },

    // Data + ops
    { type: "data_entry", media: null, base: 9, max: 16 },
    { type: "document_check", media: null, base: 10, max: 18 },
    { type: "price_audit", media: null, base: 10, max: 18 },
    { type: "lead_enrichment", media: null, base: 12, max: 20 },

    // Surveys (classic earning-platform feel)
    { type: "survey_micro", media: null, base: 9, max: 16 },
    { type: "survey_longform", media: null, base: 14, max: 24 },
    { type: "survey_validation", media: null, base: 10, max: 18 },

    // Review + QA
    { type: "product_review", media: "image", base: 14, max: 24 },
    { type: "ui_testing", media: "image", base: 12, max: 22 },
    { type: "bug_report", media: null, base: 12, max: 20 },
    { type: "content_moderation", media: "image", base: 12, max: 22 },

    // Customer / marketplace
    { type: "customer_chat", media: null, base: 10, max: 18 },
    { type: "email_triage", media: null, base: 10, max: 18 },
    { type: "knowledge_base", media: null, base: 12, max: 20 }
  ];

  function rewardFor(t) {
    const r = t.base + Math.floor(Math.random() * (t.max - t.base + 1));
    return Math.max(10, Math.min(30, r));
  }

  if (!hasTasks) {
    const TOTAL = 2500; // thousands
    await run("BEGIN");
    try {
      for (let i = 1; i <= TOTAL; i++) {
        const t = TYPES[i % TYPES.length];
      const complexity =
        t.type === "video_transcription" ? 3 :
        t.type === "image_caption" ? 2 :
        t.type === "product_review" ? 2 :
        t.type === "ui_testing" ? 2 :
        t.type === "bug_report" ? 2 :
        1;
      const reward_ksh = rewardFor(t);

      let media_url = null;
      if (t.media === "audio") media_url = MEDIA.audio[i % MEDIA.audio.length];
      if (t.media === "video") media_url = MEDIA.video[i % MEDIA.video.length];
      if (t.media === "image") media_url = MEDIA.image[i % MEDIA.image.length];

      const titleBase =
        t.type === "audio_transcription" ? "Audio Transcription" :
        t.type === "video_transcription" ? "Video Transcription" :
        t.type === "image_caption" ? "Image Caption" :
        t.type === "image_tagging" ? "Image Tagging" :
        t.type === "text_cleanup" ? "Text Cleanup" :
        t.type === "data_entry" ? "Data Entry" :
        t.type === "document_check" ? "Document Check" :
        t.type === "price_audit" ? "Price Audit" :
        t.type === "lead_enrichment" ? "Lead Enrichment" :
        t.type === "survey_micro" ? "Micro Survey" :
        t.type === "survey_longform" ? "Long Survey" :
        t.type === "survey_validation" ? "Survey Validation" :
        t.type === "product_review" ? "Product Review" :
        t.type === "ui_testing" ? "UI Testing" :
        t.type === "bug_report" ? "Bug Report" :
        t.type === "content_moderation" ? "Content Moderation" :
        t.type === "customer_chat" ? "Customer Chat" :
        t.type === "email_triage" ? "Email Triage" :
        "Knowledge Base";

      const prompt =
        t.type === "audio_transcription" ? "Listen and transcribe exactly what is spoken. Use punctuation. If unclear, write [inaudible]." :
        t.type === "video_transcription" ? "Watch the clip and transcribe any spoken words. If no speech, describe visible on-screen text briefly." :
        t.type === "image_caption" ? "Write a clear 1–2 sentence caption describing what is visible (subjects + setting)." :
        t.type === "image_tagging" ? "Provide 8–12 comma-separated tags describing objects, place, and action." :
        t.type === "text_cleanup" ? "Rewrite the text to be clear and correct (fix grammar/spelling) without changing meaning." :

        // Data + ops
        t.type === "data_entry" ? "Extract key fields from a short paragraph (name, date, amount, location). Return as: name=, date=, amount=, location=." :
        t.type === "document_check" ? "Check a short document snippet for missing details and suggest corrections. Return: issues=..., fixes=..." :
        t.type === "price_audit" ? "Review a pricing line and flag mismatches or suspicious entries. Return: risk_level=low|medium|high and notes." :
        t.type === "lead_enrichment" ? "Given a brief lead description, propose 3 enrichment fields (industry, company_size, likely_need) with short justifications." :

        // Surveys
        t.type === "survey_micro" ? "Answer the survey in 3–5 bullet points. Be honest, specific, and concise." :
        t.type === "survey_longform" ? "Write a detailed survey response (120–200 words). Include one example from real life and one recommendation." :
        t.type === "survey_validation" ? "Check a short survey response for completeness. If information is missing, list 3 follow-up questions." :

        // Review + QA
        t.type === "product_review" ? "Look at the image and write a short product-style review: 2 positives, 1 drawback, and a 1-sentence recommendation." :
        t.type === "ui_testing" ? "Review the screenshot/image and list 3 UI improvements (clarity, spacing, accessibility)." :
        t.type === "bug_report" ? "Write a clear bug report with: summary, steps, expected, actual, environment." :
        t.type === "content_moderation" ? "Classify the content as safe or unsafe and explain in 1–2 sentences." :

        // Customer / marketplace
        t.type === "customer_chat" ? "Reply to a customer query in a professional tone. Confirm the issue, propose a next step, and ask one clarifying question." :
        t.type === "email_triage" ? "Summarize an email in 2 lines and propose the next action. Tag it as: billing|support|sales|other." :
        "Write a short FAQ entry (question + answer) for a product feature. Keep it clear and customer-friendly.";

      const description = prompt;

        await run(
          `INSERT INTO tasks (type, category, title, description, prompt, media_url, image, reward_ksh, complexity, active)
           VALUES (?,?,?,?,?,?,?,?,?,1)`,
          [
            t.type,
            t.type,
            `${titleBase} #${i}`,
            description,
            prompt,
            media_url,
            media_url,
            reward_ksh,
            complexity
          ]
        );
      }
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }
  }

  // --- Post-seed migrations + richer catalog (idempotent) ---
  // 1) Assign broader categories (improves daily task diversity)
  await run(
    `UPDATE tasks
     SET category = CASE
       WHEN type IN ('audio_transcription','video_transcription') THEN 'Transcription'
       WHEN type IN ('image_caption','image_tagging','product_review','ui_testing','content_moderation') THEN 'Visual Tasks'
       WHEN type IN ('text_cleanup','document_check','knowledge_base') THEN 'Content & Writing'
       WHEN type IN ('data_entry','price_audit','lead_enrichment') THEN 'Data & Research'
       WHEN type IN ('customer_chat','email_triage') THEN 'Customer Support'
       WHEN type IN ('bug_report') THEN 'Quality Assurance'
       WHEN type LIKE 'survey_%' THEN 'Surveys'
       ELSE category
     END
     WHERE category = type OR category IS NULL OR TRIM(category) = ''`
  );

  // 2) Insert more realistic tasks and short surveys (unique by title)
  const EXTRA = [
    // --- Surveys (short, realistic) ---
    {
      type: 'survey_pulse',
      category: 'Surveys',
      title: 'Survey: Mobile Money Habits (2 minutes)',
      prompt:
        'Answer the short survey (use 1–2 sentences each):\n' +
        '1) Which mobile money service do you use most and why?\n' +
        '2) How often do you send money in a typical week?\n' +
        '3) Biggest pain-point you face (fees, downtime, limits, scams, other)?\n' +
        'Options (pick if you want): A) Fees B) Downtime C) Limits D) Fraud/Scams E) Other',
      reward_ksh: 15,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_brand',
      category: 'Surveys',
      title: 'Survey: Brand Preference (quick vote)',
      prompt:
        'Choose ONE option and explain in 1–2 sentences:\n' +
        'Which online marketplace do you trust the most for electronics?\n' +
        'Options: A) Jumia B) Kilimall C) Amazon/International D) Physical shops E) I do not buy online',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_product',
      category: 'Surveys',
      title: 'Survey: App Feature Feedback (3 questions)',
      prompt:
        'You are testing an earning app. Answer honestly:\n' +
        '1) What would make you trust the platform more?\n' +
        '2) Which rewards feel fair for 5–10 minutes work?\n' +
        '3) What support channel do you prefer?\n' +
        'Options: A) WhatsApp B) Email C) Live chat D) Phone call',
      reward_ksh: 18,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_validation_plus',
      category: 'Surveys',
      title: 'Survey QA: Validate a response',
      prompt:
        'Read this response and rate completeness (0–10). Then list 2 missing details:\n' +
        'Response: “I like the app because it is easy. The payments are okay.”\n' +
        'Return as: score=, missing=...',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },

    {
      type: 'survey_security',
      category: 'Surveys',
      title: 'Survey: Online Safety Awareness (quick)',
      prompt:
        'Answer briefly (1–2 sentences each):\n' +
        '1) Have you seen mobile-money scams recently?\n' +
        '2) Which warning sign is most common?\n' +
        'Options: A) Fake SMS B) Calls pretending to be support C) Social media links D) OTP requests E) Other',
      reward_ksh: 15,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_streaming',
      category: 'Surveys',
      title: 'Survey: Streaming & Data Bundles (2 minutes)',
      prompt:
        'Pick the best option and explain briefly:\n' +
        'Which matters most when streaming videos on mobile?\n' +
        'Options: A) Low data usage B) High quality C) Offline downloads D) No buffering E) Price',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_shopping',
      category: 'Surveys',
      title: 'Survey: Online Shopping Experience',
      prompt:
        'Answer these 3 questions:\n' +
        '1) Last item you bought online (category only)?\n' +
        '2) Delivery time you consider acceptable?\n' +
        '3) Most important factor: price, reviews, return policy, or seller trust?\n' +
        'Provide answers as: item=..., delivery=..., factor=...',
      reward_ksh: 18,
      complexity: 1,
      media_url: null,
    },

    // --- More realistic tasks ---
    {
      type: 'receipt_review',
      category: 'Data & Research',
      title: 'Receipt Review: Extract totals',
      prompt:
        'Given a receipt text snippet, extract: merchant, date, subtotal, tax, total.\n' +
        'Return as JSON keys: merchant,date,subtotal,tax,total. (If missing, use null.)',
      reward_ksh: 16,
      complexity: 2,
      media_url: null,
    },
    {
      type: 'invoice_check',
      category: 'Data & Research',
      title: 'Invoice Check: Find inconsistencies',
      prompt:
        'You are checking an invoice. List any red flags you would verify (3–5 bullets).\n' +
        'Think: missing VAT, mismatched totals, missing company details, unusual discounts.',
      reward_ksh: 17,
      complexity: 2,
      media_url: null,
    },
    {
      type: 'product_compare',
      category: 'Data & Research',
      title: 'Product Comparison: Choose the better option',
      prompt:
        'Compare two options and pick one with 2 reasons:\n' +
        'Option A: 8GB RAM, 256GB SSD, older CPU\n' +
        'Option B: 16GB RAM, 512GB SSD, mid CPU\n' +
        'Return: choice=A|B, reasons=...',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'social_caption',
      category: 'Content & Writing',
      title: 'Social Caption: Write a short promo',
      prompt:
        'Write a 2–3 line social media caption promoting a “Weekend Flash Sale”.\n' +
        'Include: urgency + one benefit + one CTA. Keep it professional.',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'ad_copy',
      category: 'Content & Writing',
      title: 'Ad Copy: Create a headline + CTA',
      prompt:
        'Write 3 ad headlines (max 45 characters each) and 1 CTA for a “Digital Services” business.\n' +
        'Keep tone premium and clear.',
      reward_ksh: 16,
      complexity: 2,
      media_url: null,
    },
    {
      type: 'faq_write_plus',
      category: 'Content & Writing',
      title: 'FAQ Writing: Payments & Withdrawals',
      prompt:
        'Write 1 FAQ item (Question + Answer) about withdrawals.\n' +
        'Include: activation fee is external via Pesapal, and withdrawals require verified phone number.',
      reward_ksh: 18,
      complexity: 2,
      media_url: null,
    },
    {
      type: 'map_validation',
      category: 'Data & Research',
      title: 'Location Validation: Check address format',
      prompt:
        'Normalize the address to a clean format and identify missing parts:\n' +
        '“Shop 12, near Stage, nyuma ya supermarket, Nairobi”\n' +
        'Return: normalized=..., missing=...',
      reward_ksh: 15,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'contact_enrichment',
      category: 'Data & Research',
      title: 'Lead Enrichment: Add missing fields',
      prompt:
        'Lead: “Small shop selling phone accessories in town.”\n' +
        'Suggest: business_type, target_customers, best_contact_time, and one upsell idea.',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'policy_ack',
      category: 'Quality Assurance',
      title: 'Policy Check: Decide if content is allowed',
      prompt:
        'Decide if the content is allowed on a general platform and explain briefly:\n' +
        '“Selling accounts for streaming services.”\n' +
        'Return: allowed=yes|no, reason=...',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'ui_accessibility',
      category: 'Quality Assurance',
      title: 'UI QA: Accessibility quick check',
      prompt:
        'List 4 accessibility improvements for a dashboard (contrast, focus states, labels, font sizes, etc.).\n' +
        'Return as bullets.',
      reward_ksh: 15,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'customer_reply_plus',
      category: 'Customer Support',
      title: 'Customer Support: Compose a WhatsApp reply',
      prompt:
        'Customer says: “I paid activation fee but still cannot withdraw.”\n' +
        'Write a WhatsApp-style reply: apologize, confirm details needed, and give next step.\n' +
        'Ask for: payment reference + phone number used + time of payment.',
      reward_ksh: 18,
      complexity: 2,
      media_url: null,
    },
    {
      type: 'email_reply',
      category: 'Customer Support',
      title: 'Customer Support: Email response draft',
      prompt:
        'Write a short email reply to a user who forgot their password.\n' +
        'Include: empathy + next steps + security reminder (do not share OTP/password).',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'chat_tagging',
      category: 'Customer Support',
      title: 'Ticket Tagging: Classify the request',
      prompt:
        'Classify this ticket into one: billing|activation|tasks|withdrawal|other, then explain why:\n' +
        '“I completed tasks but balance did not increase.”\n' +
        'Return: tag=..., reason=...',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },

    {
      type: 'faq_write',
      category: 'Content & Writing',
      title: 'FAQ Writing: Activation & Withdrawals',
      prompt:
        'Write an FAQ entry with two parts:\n' +
        'Q: Why do I need to pay the activation fee?\n' +
        'A: (explain in 3–4 lines)\n\n' +
        'Q: How long do withdrawals take?\n' +
        'A: (explain in 2–3 lines).',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'survey_price_sensitivity',
      category: 'Surveys',
      title: 'Survey: Price Sensitivity (quick choices)',
      prompt:
        'Choose ONE option and add one sentence why:\n' +
        'For a 5-minute task, what reward feels fair?\n' +
        'Options: A) KES 5–10 B) KES 11–20 C) KES 21–30 D) KES 31–50',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'data_normalization',
      category: 'Data & Research',
      title: 'Data Cleanup: Normalize phone numbers',
      prompt:
        'Normalize these phone numbers to E.164 format (country code required).\n' +
        'Numbers: 0712 345 678, +254712345678, 254 700 111222\n' +
        'Return one per line.',
      reward_ksh: 16,
      complexity: 1,
      media_url: null,
    },
    {
      type: 'micro_translation',
      category: 'Content & Writing',
      title: 'Short Translation: Customer message',
      prompt:
        'Translate the message to clear professional English:\n' +
        '“Nimeweka payment lakini bado haijaonekana. Naomba msaada.”',
      reward_ksh: 14,
      complexity: 1,
      media_url: null,
    },
  ];

  for (const t of EXTRA) {
    const exists = await get("SELECT id FROM tasks WHERE title=? LIMIT 1", [t.title]);
    if (exists) continue;
    await run(
      `INSERT INTO tasks (type, category, title, description, prompt, media_url, image, reward_ksh, complexity, active)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [
        t.type,
        t.category,
        t.title,
        t.prompt,
        t.prompt,
        t.media_url,
        t.media_url,
        t.reward_ksh,
        t.complexity,
      ]
    );
  }
}

module.exports = { db, run, get, all, initDb };
