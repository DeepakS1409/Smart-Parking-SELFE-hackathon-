/**
 * Terminal Entry QR Code Generator for Smart Parking
 *
 * Generates an official parking facility entrance gate QR code directly in the terminal
 * for testing the mobile camera scanner.
 *
 * Distinct payload format:
 * SMART_PARK:ENTRY:GATE_A_LEVEL1:GRAND_CENTRAL:TOKEN_SECURE_2026
 *
 * Usage:
 * npm run entry-qr
 */

const qrcode = require('qrcode-terminal');

const ENTRY_PAYLOAD = 'SMART_PARK:ENTRY:GATE_A_LEVEL1:GRAND_CENTRAL:TOKEN_SECURE_2026';

console.log('\n========================================================================');
console.log('       🚘 SMART PARKING — ENTRANCE BARRIER GATE QR CODE 🚘');
console.log('========================================================================');
console.log('Facility: Grand Central Plaza • Level 1');
console.log('Entrance: Gate A (North Deck Entrance)');
console.log('Payload : ' + ENTRY_PAYLOAD);
console.log('Note    : This is NOT the Expo development server URL.');
console.log('          Scan this code using the in-app "Scan Entry QR" camera scanner.');
console.log('========================================================================\n');

qrcode.generate(ENTRY_PAYLOAD, { small: true }, function (qr) {
  console.log(qr);
  console.log('\n========================================================================');
  console.log('Ready! Hold your phone camera in the Smart Parking app to scan.');
  console.log('========================================================================\n');
});
