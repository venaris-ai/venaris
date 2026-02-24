# Venaris

Venaris is an AI-powered wildlife monitoring and data platform.

The goal is to ingest camera assets (images), store them reliably, and turn them into structured wildlife events and insights.

---

## 🚀 Current MVP Scope

- Manual image upload per camera
- Supabase Storage integration
- Asset tracking in database
- Signed preview URLs
- Relevant / irrelevant tagging
- Camera health via `last_seen_at`

---

## 🧱 Tech Stack

- Next.js (App Router)
- Supabase (Postgres + Storage)
- Tailwind CSS

---

## 📂 Core Data Model

- **reviers** – hunting areas
- **cameras** – cameras per revier
- **assets** – uploaded images
- **detections** – AI results per image
- **events** – aggregated wildlife events
- **event_assets** – event ↔ asset relation

---

## 🛠 Local Development

1. Install dependencies:

```bash
npm install