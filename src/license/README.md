# CashSkillBD License System (per-member keys)

## কীভাবে কাজ করে

- প্রত্যেক member-এর আলাদা key: `CSB-XXXX-XXXX-XXXX-XXXX` ফরম্যাটে।
- Server-এ (private repo `Niczzxo/CashskillBD-Licenses`, `licenses.json`) শুধু key-এর
  **SHA-256 hash** থাকে — আসল key কোথাও store হয় না, hash থেকে key বের করা যায় না।
- Member extension-এ key দিলে extension locally hash করে registry-তে মিলিয়ে দেখে।
- Browser চালু হলে + প্রতি ৬ ঘণ্টায় key আবার check হয়।
- **Key revoke করলে** (registry থেকে মুছে দিলে বা `revoked: true` করলে) member-এর
  extension পরের check-এ lock হয়ে যাবে, নতুন key চাইবে।
- Offline থাকলে শেষ known status বহাল থাকে (network blip-এ কেউ lock out হবে না)।

## Admin setup (একবার)

1. GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token:
   - **Admin token** (key বানানো/revoke-এর জন্য): Repository access → Only select
     repositories → `CashskillBD-Licenses` → Permissions → Contents:
     **Read and write**। এটা শুধু License Admin page-এ ব্যবহার হবে (browser-এর
     localStorage-এ থাকে, extension-এ যায় না)।
2. Extension-এর জন্য কোনো token লাগে না — registry public, শুধু hash থাকে।

## Key দেওয়া / বাতিল করা

- **License Admin page** খুলে (admin token দিয়ে) member-এর নাম লিখে Generate চাপ দাও →
  key পাবে, member-কে পাঠিয়ে দাও।
- কাউকে বাদ দিতে চাইলে তার key-এর পাশে **Revoke** চাপ দাও — কয়েক মিনিটের মধ্যে
  তার extension lock হয়ে যাবে। বাকিদের কিছু হবে না।
- ভুলে revoke করলে **Restore** চাপ দিলে আবার চালু হয়ে যাবে।

## registry ফরম্যাট (licenses.json)

```json
{
  "version": 1,
  "keys": {
    "<sha256-hex-of-key>": { "created": "2026-10-12T00:00:00.000Z", "revoked": false }
  }
}
```

## সীমা (জেনে রাখো)

- Extension client-side — খুব technical কেউ চাইলে lock bypass করতে পারবে।
  সাধারণ member-দের জন্য এটা যথেষ্ট শক্ত gate।
- Revoke কার্যকর হতে কয়েক মিনিট লাগতে পারে (পরের validation পর্যন্ত)।
