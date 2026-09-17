// VerifyPage is the public, QR-scanned card page. It intentionally keeps
// its own visitor-controlled language toggle (independent of the site-wide
// language switcher — see the comment in VerifyPage.jsx), so this dict is
// consumed directly by that page's local toggle rather than through the
// global useLanguage()/t() hook.
export const km = {
  "verifyPage.notFound": "រកមិនឃើញ",
  "verifyPage.recordNotFound": "រកមិនឃើញកំណត់ត្រា",
  "verifyPage.verified": "កីឡាករបានផ្ទៀងផ្ទាត់",
  "verifyPage.unverified": "មិនទាន់បានផ្ទៀងផ្ទាត់",
  "verifyPage.available": "នៅមាន",
  "verifyPage.notAvailable": "អវត្តមាន",
  "verifyPage.dob": "ថ្ងៃខែឆ្នាំកំណើត",
  "verifyPage.gender": "ភេទ",
  "verifyPage.team": "ក្រុម",
  "verifyPage.role": "តួនាទី",
  "verifyPage.address": "អាសយដ្ឋាន",
  "verifyPage.id": "លេខសម្គាល់",
  "verifyPage.khmerToggleLabel": "ខ្មែរ",
  "verifyPage.englishToggleLabel": "English",
};

export const en = {
  "verifyPage.notFound": "Not found",
  "verifyPage.recordNotFound": "Record not found",
  "verifyPage.verified": "Verified athlete",
  "verifyPage.unverified": "Not yet verified",
  "verifyPage.available": "Available",
  "verifyPage.notAvailable": "Not available",
  "verifyPage.dob": "Date of birth",
  "verifyPage.gender": "Gender",
  "verifyPage.team": "Team",
  "verifyPage.role": "Role",
  "verifyPage.address": "Address",
  "verifyPage.id": "ID",
  "verifyPage.khmerToggleLabel": "ខ្មែរ",
  "verifyPage.englishToggleLabel": "English",
};
