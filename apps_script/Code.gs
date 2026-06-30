/**
 * Google Apps Script backend for Human Explanation Scoring.
 *
 * SETUP
 *   1. Create a Google Sheet. Copy its ID from the URL:
 *        https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
 *   2. Extensions -> Apps Script. Replace the default file with this code.
 *   3. Set SHEET_ID below.
 *   4. Deploy -> New deployment -> type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the /exec URL into CONFIG.SHEETS_URL in app.js.
 *   5. Re-deploy (Manage deployments -> edit -> new version) whenever you
 *      change this script.
 *
 * The web app POSTs JSON like:
 *   { "type": "scores", "records": [ {annotator, model, world, seed,
 *       humanScore, notes, judgeScore, judgeRaw, judgeMax, timestamp}, ... ] }
 */

var SHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
var SHEET_NAME = "scores";

var HEADERS = [
  "received_at", "annotator", "model", "world", "seed",
  "human_score", "notes", "judge_score", "judge_raw", "judge_max",
  "client_timestamp"
];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var records = payload.records || [payload];
    var sheet = getSheet_();
    var now = new Date();
    var rows = records.map(function (r) {
      return [
        now,
        str_(r.annotator),
        str_(r.model),
        str_(r.world),
        num_(r.seed),
        num_(r.humanScore),
        str_(r.notes),
        num_(r.judgeScore),
        num_(r.judgeRaw),
        num_(r.judgeMax),
        str_(r.timestamp)
      ];
    });
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return json_({ ok: true, added: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  // Lightweight health check you can open in a browser.
  return json_({ ok: true, service: "human-explanation-scoring", rows: getSheet_().getLastRow() - 1 });
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function str_(v) { return v == null ? "" : String(v); }
function num_(v) { return (v === null || v === undefined || v === "") ? "" : v; }
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
