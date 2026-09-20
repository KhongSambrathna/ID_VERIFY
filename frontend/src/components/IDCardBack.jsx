// The back side of the printed ID card — same physical size as the front
// (IDCard.jsx, 70x105mm), showing the terms of use in Khmer and English.
// Static/non-athlete-specific: every printed card shares the same back, so
// this takes no props. Printed on its own, independent of any athlete data,
// from PrintCardBacksPage.jsx — pick a copy count there and this renders
// that many times into the normal .cards-grid, packed multiple-per-sheet
// exactly like a front-card bulk print. Matching it up physically with a
// given athlete's front card (cutting/pairing/laminating) is left to the
// person printing, not handled by page layout here.
const TERMS = [
  {
    kh: 'ប្រើប្រាស់សម្រាប់តែការប្រកួតដែលរៀបចំឡើងដោយគណៈកម្មការប្រកួតរបស់ "ការប្រកួតបាល់ទាត់ស្រុកស្រែ" និងដៃគូសហការរបស់ "ការផ្ទៀងផ្ទាត់អត្តសញ្ញាណបាល់ទាត់ស្រុកស្រែ" តែប៉ុណ្ណោះ។',
    en: 'Applicable exclusively to matches organized by the competition committee of "Countryside Football Match" and the official partners of "Countryside Football ID Verify".',
  },
  {
    kh: "ហាមផ្ទេរឱ្យអ្នកដទៃប្រើប្រាស់ និងត្រូវយកតាមខ្លួន ឬបង្ហាញរាល់ពេលមានការប្រកួត។",
    en: "Non-transferable to others and must be carried or presented during every match.",
  },
  {
    kh: "រាល់ព័ត៌មានដែលមានក្នុងកាតគឺត្រូវបានផ្តល់ដោយម្ចាស់ខ្លួន។ ករណីក្លែងបន្លំអត្តសញ្ញាណ ឬប្រើប្រាស់ក្នុងគោលបំណងមិនស្របច្បាប់ ម្ចាស់ខ្លួនត្រូវទទួលខុសត្រូវទាំងស្រុងចំពោះមុខច្បាប់ និងគណៈកម្មការ។",
    en: "All information on this card is provided by the holder. In the event of identity fraud, unauthorized, or illegal use, the holder shall be solely responsible.",
  },
  {
    kh: "គណៈកម្មការមានសិទ្ធិដកហូតកាតនេះវិញ ប្រសិនបើរកឃើញការប្រព្រឹត្តល្មើសនឹងលក្ខខណ្ឌនៃការប្រកួត។",
    en: "The committee reserves the right to revoke this card if tournament rules are violated.",
  },
];

export default function IDCardBack() {
  return (
    <div className="id-card-print-page">
      <div className="id-card-wrap">
        <div className="id-card id-card-back">
          <div className="id-card-top">
            <div className="org">
              <span className="en">Countryside Football ID Verify</span>
            </div>
          </div>

          <div className="id-card-back-title">
            <span className="kh">លក្ខខណ្ឌនៃការប្រើប្រាស់</span>
            <span className="en">TERMS OF USE</span>
          </div>

          <ol className="id-card-terms">
            {TERMS.map((clause, i) => (
              <li key={i}>
                <p className="kh">{clause.kh}</p>
                <p className="en">{clause.en}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
