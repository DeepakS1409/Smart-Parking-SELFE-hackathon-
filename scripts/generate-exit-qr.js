/**
 * Terminal Exit QR Code Generator for Smart Parking
 *
 * Generates an official parking facility barrier EXIT QR code in the terminal
 * for testing the exit and ₹50 demo payment flow.
 *
 * Distinct payload format:
 * SMART_PARK:EXIT:GATE_EXIT_01:SMART_PARKING_TEST_EXIT:2026
 *
 * Usage:
 * npm run exit-qr
 */

const qrcode = require('qrcode-terminal');

const EXIT_PAYLOAD = 'SMART_PARK:EXIT:GATE_EXIT_01:SMART_PARKING_TEST_EXIT:2026';

console.log('\n========================================================================');
console.log('       🚗 SMART PARKING — EXIT BARRIER GATE QR CODE 🚗');
console.log('========================================================================');
console.log('Facility: Grand Central Plaza • Level 1');
console.log('Gate    : Exit Barrier Gate 01');
console.log('Label   : SMART_PARKING_TEST_EXIT');
console.log('Payload : ' + EXIT_PAYLOAD);
console.log('Fee     : ₹50 Fixed Demo Fee');
console.log('Note    : This is NOT the Expo dev server or entry QR.');
console.log('          Scan this with the Smart Parking app to complete checkout.');
console.log('========================================================================\n');

qrcode.generate(EXIT_PAYLOAD, { small: true }, function (qr) {
  console.log(qr);
  console.log('\n========================================================================');
  console.log('Ready! Hold your phone camera up to scan, or use the in-app Test Exit.');
  console.log('========================================================================\n');
});
