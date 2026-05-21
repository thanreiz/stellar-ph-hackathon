# Design System Specification: Kaagapay ng Tindahan (The Store's Companion)

## 1. Overview & Creative North Star: "Kaagapay ng Tindahan"
The creative direction for this design system is **Kaagapay ng Tindahan** (The Store's Companion). This system is designed specifically for Filipino Sari-Sari store owners (Nanays and Tatays) who manage local micro-retail businesses. It balances the high-tech reliability of Stellar blockchain financing with a warm, welcoming, and reassuring visual language that reduces financial anxiety and feels like a physical ledger companion.

It features **Plus Jakarta Sans** for expressive headers and metric labels to give a clean, premium, but friendly appearance, and **Inter** for dense tabular inputs, logs, and controls. The layout uses card layering, clear grid structures, and bento-style stats cards to simplify complex financial data.

---

## 2. Color Palette & Tonal Architecture: "Pera at Tiwala" (Money and Trust)
Filipino store owners associate growth and business with deep green (pera/sales) and trust/technology with G-Cash blue. 

To support the store owner under different lighting conditions (inside a dim storefront at night or under bright daylight), the system provides full Light and Dark modes.

### Light Mode Colors
*   **Background / Canvas:** `surface` (#FCFDF9) — A warm, soft off-white resembling clean paper.
*   **Tonal Card Backgrounds:**
    *   `surface-container-low` (#F5F4ED) — For groupings and layout structures.
    *   `surface-container-lowest` (#FFFFFF) — Elevated cards that pop off the warm background.
    *   `surface-container-high` (#E9E8E0) — For inactive tabs, borders, and input backgrounds.
*   **Typography:**
    *   `on-surface` (#1A1C19) — Deep charcoal black for primary readability (never pure black).
    *   `on-surface-variant` (#434842) — Muted gray-green for secondary helper labels.
*   **Theme Accents:**
    *   `primary` (#0D6F37) — Filipino Green, representing store sales, success, and growth.
    *   `primary-container` (#A6F8B4) — Soft green wash for badges and alert backdrops.
    *   `secondary` (#53634F) — Muted forest sage for utility buttons and minor details.
    *   `accent-blue` (#2563EB) — Freighter Wallet & Stellar network indicators (reassuring tech blue).
    *   `error` (#DC2626) — Shortages, outstanding debt, and warnings.
    *   `error-container` (#FFDAD6) — Muted red background.

### Dark Mode Colors
*   **Background / Canvas:** `surface` (#111411) — Deep dark charcoal-green.
*   **Tonal Card Backgrounds:**
    *   `surface-container-low` (#1A1C18) — For grouping backgrounds.
    *   `surface-container-lowest` (#0C0F0C) — Deep dark card backgrounds.
    *   `surface-container-high` (#282B26) — Inputs and dividers.
*   **Typography:**
    *   `on-surface` (#E2E3DD) — Warm silver-white.
    *   `on-surface-variant` (#C4C8C0) — Soft warm gray.
*   **Theme Accents:**
    *   `primary` (#8BE59A) — Glowing mint green for success indicators and highlights.
    *   `primary-container` (#005224) — Deep pine green wash.
    *   `secondary` (#BACCB3) — Warm sage.
    *   `accent-blue` (#60A5FA) — Radiant electric blue for tech.
    *   `error` (#FFB4AB) — Bright warning coral.
    *   `error-container` (#93000A) — Deep maroon.

---

## 3. Typography & Hierarchy
The typographical system focuses on readability, bold metrics, and structured listings.

*   **Display & Large Numbers (Plus Jakarta Sans):** Used for titles, stats, and large currency metrics.
    *   `display-lg` (30px, Extra Bold, 38px Line Height) — Primary stats (e.g. Sales Today, Tiwala Score).
    *   `headline-md` (24px, Bold, 32px Line Height) — Section titles (e.g. Kaha, Scanner).
*   **Body & Utility Text (Inter):** Clean, standard sans-serif for forms, guides, and list rows.
    *   `body-lg` (16px, Regular, 24px Line Height) — Paragraphs and instructions.
    *   `body-md` (14px, Regular, 20px Line Height) — Small logs and details.
*   **Labels & Codes (Inter Mono/Semi-Bold):**
    *   `label-md` (12px, Semi-Bold, 16px Line Height, 0.02em letter spacing) — Section tags and categories (e.g., "LENDER," "TX HASH").
    *   `label-sm-mono` (11px, Medium, 14px Line Height, 0.05em letter spacing) — Transaction hashes, public keys, and status badges.

---

## 4. UI Elements & Layout Rules
*   **Bento Card Grid:** Statistical summaries (Sales, Benta, Expenses, Tiwala Score, Loan Limit) are grouped in clean, asymmetrical, borderless grid blocks with soft backgrounds.
*   **No Raw Borders:** Section boundaries are created by switching between `surface-container-low` and `surface-container-lowest` rather than 1px solid lines.
*   **Gradients:** Buttons use a subtle linear gradient from `primary` (#0D6F37) to a brighter emerald (#1E8E4F) to give a modern, tactile fintech feel.
*   **Rounded Shapes:** Cards use a `12px` (md) radius, inputs use a `8px` (DEFAULT) radius, and primary action buttons use full pill-shaped (`9999px`) styling.
*   **Tap Targets:** Buttons, inputs, and tab options maintain a minimum tap target of `48px` to ensure Tatays can easily navigate without accidental taps.
*   **Offline Banner:** A persistent top alert in `#FF3B30` or coral red: *"Naka-Offline Mode. I-save muna sa phone."* that matches safe area margins.

---

## 5. Filipino Localization & Glossary (Taglish)
We use a friendly, colloquial "Taglish" voice to help the user feel supported:

| English term | Taglish / Local term | Explanation |
|---|---|---|
| Dashboard | **Kaha** | "Cashbox" - represents cash status. |
| Sales Today | **Benta Ngayong Araw** | Daily logged sales. |
| Total Synced Sales | **Kabuuang Benta** | Synced ledger records. |
| Expenses | **Mga Gastos** | Outflows logged. |
| Trust / Credit Score | **Tiwala Score** | Credibility rating (Tiwala = Trust). |
| Loan Limit | **Limit sa Utang** | Capital upgrade allowance. |
| Log daily sales | **I-record ang Benta** | Form action. |
| Confirm payment | **Kumpirmahin ang Bayad** | Stellar transaction modal header. |
| Paid / Settled | **Bayad Na** | Successful payment badge / state. |
| Offline Mode Warning | **Naka-Offline Mode. I-save muna sa phone.** | Notification banner. |
| Verify invoice | **I-validate ang Stellar Invoice** | Blockchain checker tool. |
| Create document | **Gumawa ng Dokumento** | Receipt packing tool. |
