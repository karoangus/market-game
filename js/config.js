// =============================================================
//  config.js — کاتالوگ محصولات و تنظیمات کل بازی
//
//  ➕ افزودن محصول جدید: فقط یک ردیف به PRODUCTS اضافه کن.
//     صحنهٔ سه‌بعدی، قفسه‌ها، پنل قیمت‌گذاری، تأمین‌کننده و
//     رفتار مشتری‌ها همه از همین فایل می‌خوانند.
//
//  ➕ افزودن نوسان قیمت برای محصولی: پرکردن priceRange و
//     فعال‌سازی پرچم fluctuates (سیستم آماده است).
// =============================================================

export const PRODUCTS = [
  {
    id: 'bread',
    name: 'نان',
    emoji: '🍞',
    color: 0xd9a066,
    basePrice: 4, // قیمت فعلی — به‌آسانی قابل تنظیم است
    priceRange: { min: 2, max: 8 }, // محدودهٔ آماده برای وقتی که نوسان روزانه فعال شود
    fluctuates: false, // فعلاً قیمت نان ثابت است؛ در آپدیت بعدی این پرچم روی true قرار بگیرد
  },
  {
    id: 'apple',
    name: 'سیب',
    emoji: '🍎',
    color: 0xd94f3d,
    basePrice: 10,
    priceRange: { min: 5, max: 20 },
    fluctuates: true,
  },
  {
    id: 'banana',
    name: 'موز',
    emoji: '🍌',
    color: 0xf2c94c,
    basePrice: 13,
    priceRange: { min: 7, max: 17 },
    fluctuates: true,
  },
  {
    id: 'oil',
    name: 'روغن',
    emoji: '🛢️',
    color: 0x7fb069,
    basePrice: 17,
    priceRange: { min: 10, max: 20 },
    fluctuates: true,
  },
  {
    id: 'rice',
    name: 'برنج',
    emoji: '🍚',
    color: 0xf3ead7,
    basePrice: 20,
    priceRange: { min: 15, max: 30 },
    fluctuates: true,
  },
];

export const GAME = {
  startingMoney: 100, // سرمایهٔ اولیه (دلار)
  storeSize: { w: 5, d: 4 }, // ۵×۴ = ۲۰ متر مربع
  maxDisplayPerShelf: 12, // تعداد اقلام نمایش‌داده‌شده روی هر قفسه
  price: {
    min: 1, // حداقل قیمت فروش مجاز
    max: 100, // حداکثر قیمت فروش مجاز
    step: 1, // گام تغییر قیمت در رابط کاربری
    defaultMargin: 2, // قیمت فروش پیش‌فرض = قیمت خرید + این عدد
  },
  customers: {
    base: 8, // تعداد مشتری‌های پایه در روز
    perDay: 0.5, // رشد تدریجی با گذشت روزها
    max: 16, // سقف مشتری در روز
  },
};
