/**
 * Google Apps Script for School Enrollment System
 * ใช้กับ Google Sheets เพื่อเก็บข้อมูลนักเรียน
 * 
 * วิธีใช้:
 * 1. สร้าง Google Sheet ใหม่
 * 2. Extensions > Apps Script
 * 3. วาง code นี้และบันทึก
 * 4. Deploy > New deployment
 * 5. เลือก Web app
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. Copy URL และใส่ใน app.js
 */

// Cache service for persistent sessions
const CACHE_EXPIRE_SECONDS = 21600; // 6 hours

// Configuration
const CONFIG = {
  adminPin: 'admin123',      // รหัสแอดมิน
  financePin: 'finance123',  // รหัสการเงิน
  spreadsheetId: ''          // จะถูกตั้งอัตโนมัติ
};

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index.html')
    .setTitle('ระบบมอบตัวนักเรียน');
}

function doPost(e) {
  let data = null;
  
  // Try to parse data from different sources
  try {
    if (e.parameter.action && e.parameter.data) {
      // Standard form post
      data = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      // JSON body post
      const parsed = JSON.parse(e.postData.contents);
      data = parsed.data;
      // Override action if provided in body
      if (parsed.action) e.parameter.action = parsed.action;
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  const action = e.parameter.action;
  
  try {
    let result;
    
    switch(action) {
      case 'login':
        result = handleLogin(data);
        break;
      case 'getStudents':
        result = handleGetStudents();
        break;
      case 'addStudent':
        result = handleAddStudent(data);
        break;
      case 'updateStudent':
        result = handleUpdateStudent(data);
        break;
      case 'deleteStudent':
        result = handleDeleteStudent(data.id);
        break;
      case 'saveSettings':
        result = handleSaveSettings(data);
        break;
      case 'getSettings':
        result = handleGetSettings();
        break;
      case 'saveData':
        result = handleSaveFullData(data);
        break;
      case 'getData':
        result = handleGetFullData();
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== Authentication =====

function handleLogin(data) {
  const { pin, role } = data;
  const cache = CacheService.getScriptCache();
  
  // Verify PIN based on role
  let isValid = false;
  if (role === 'admin' && pin === CONFIG.adminPin) {
    isValid = true;
  } else if (role === 'finance' && pin === CONFIG.financePin) {
    isValid = true;
  }
  
  if (isValid) {
    // Create session token
    const token = Utilities.getUuid();
    cache.put('session_' + token, role, CACHE_EXPIRE_SECONDS);
    return { success: true, token: token, role: role };
  }
  
  return { success: false, error: 'รหัสผิด' };
}

function verifySession(token) {
  const cache = CacheService.getScriptCache();
  return cache.get('session_' + token);
}

// ===== Students =====

function handleGetStudents() {
  const sheet = getOrCreateSheet('Students');
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return [];
  
  // Skip header row
  return data.slice(1).map(row => ({
    id: row[0],
    refCode: row[1],
    title: row[2],
    firstName: row[3],
    lastName: row[4],
    grade: row[5],
    shirts: JSON.parse(row[6] || '[]'),
    pants: JSON.parse(row[7] || '[]'),
    items: JSON.parse(row[8] || '[]'),
    paymentStatus: row[9],
    paidAt: row[10],
    createdAt: row[11]
  }));
}

function handleAddStudent(data) {
  const sheet = getOrCreateSheet('Students');
  const lastRow = sheet.getLastRow();
  const refCode = 'REG-' + String(lastRow).padStart(4, '0');
  
  const newRow = [
    Utilities.getUuid(),
    refCode,
    data.title || '',
    data.firstName,
    data.lastName,
    data.grade,
    JSON.stringify(data.shirts || []),
    JSON.stringify(data.pants || []),
    JSON.stringify(data.items || []),
    'pending',
    '',
    new Date().toISOString()
  ];
  
  sheet.appendRow(newRow);
  
  return { success: true, refCode: refCode };
}

function handleUpdateStudent(data) {
  const sheet = getOrCreateSheet('Students');
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      const rowNum = i + 1;
      
      sheet.getRange(rowNum, 1, 1, 12).setValues([[
        data.id,
        data.refCode,
        data.title || '',
        data.firstName,
        data.lastName,
        data.grade,
        JSON.stringify(data.shirts || []),
        JSON.stringify(data.pants || []),
        JSON.stringify(data.items || []),
        data.paymentStatus,
        data.paidAt || '',
        data.createdAt
      ]]);
      
      return { success: true };
    }
  }
  
  return { success: false, error: 'ไม่พบข้อมูล' };
}

function handleDeleteStudent(id) {
  const sheet = getOrCreateSheet('Students');
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  return { success: false, error: 'ไม่พบข้อมูล' };
}

// ===== Settings =====

function handleSaveSettings(data) {
  const sheet = getOrCreateSheet('Settings');
  sheet.clear();
  
  sheet.appendRow(['Key', 'Value']);
  sheet.appendRow(['schoolName', data.schoolName || '']);
  sheet.appendRow(['adminPin', data.adminPin || CONFIG.adminPin]);
  sheet.appendRow(['financePin', data.financePin || CONFIG.financePin]);
  sheet.appendRow(['receiverName', data.receiverName || 'เจ้าหน้าที่การเงิน']);
  
  // Save school logo (base64 data URL)
  if (data.schoolLogo) {
    sheet.appendRow(['schoolLogo', data.schoolLogo]);
  }
  
  // Save uniforms
  if (data.uniforms) {
    sheet.appendRow(['uniforms', JSON.stringify(data.uniforms)]);
  }
  
  // Save items
  if (data.items) {
    sheet.appendRow(['items', JSON.stringify(data.items)]);
  }
  
  return { success: true };
}

function handleGetSettings() {
  const sheet = getOrCreateSheet('Settings');
  const data = sheet.getDataRange().getValues();
  
  const settings = {
    schoolName: 'โรงเรียนคำยางพิทยา',
    adminPin: CONFIG.adminPin,
    financePin: CONFIG.financePin,
    receiverName: 'เจ้าหน้าที่การเงิน',
    schoolLogo: '',
    uniforms: getDefaultUniforms(),
    items: getDefaultItems()
  };
  
  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];
      
      if (key === 'uniforms' || key === 'items') {
        try {
          settings[key] = JSON.parse(value);
        } catch(e) {}
      } else {
        settings[key] = value;
      }
    }
  }
  
  return settings;
}

// ===== Full Data Sync =====

function handleSaveFullData(data) {
  try {
    const sheet = getOrCreateSheet('FullData');
    sheet.clear();
    
    // Store the entire data object as JSON string in cell A1
    const jsonData = JSON.stringify(data);
    sheet.getRange(1, 1).setValue(jsonData);
    
    // Also update human-readable sheets for convenience
    if (data.students) {
      updateStudentsSheet(data.students, data.settings);
    }
    if (data.settings) {
      updateSettingsSheet(data.settings);
    }
    
    return { status: 'success', message: 'Data saved successfully' };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function handleGetFullData() {
  try {
    const sheet = getOrCreateSheet('FullData');
    const value = sheet.getRange(1, 1).getValue();
    
    if (!value) {
      return { status: 'empty', message: 'No data found' };
    }
    
    return { status: 'success', data: value };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function updateStudentsSheet(students, settings) {
  const sheet = getOrCreateSheet('Students');
  // Clear existing data except header
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 12).clearContent();
  }
  
  if (students.length === 0) return;
  
  const rows = students.map(s => {
    // Calculate total for visibility in sheet
    let total = 0;
    if (settings) {
      (s.shirts || []).forEach(sh => {
        const u = settings.uniforms.find(x => x.id === sh.id);
        if (u) total += sh.qty * u.price;
      });
      (s.pants || []).forEach(pa => {
        const u = settings.uniforms.find(x => x.id === pa.id);
        if (u) total += pa.qty * u.price;
      });
      (s.items || []).forEach(i => {
        const iDef = settings.items.find(x => x.id === i.id);
        if (iDef) total += i.qty * iDef.price;
      });
    }

    return [
      s.id,
      s.refCode,
      s.title || '',
      s.firstName,
      s.lastName,
      s.grade,
      JSON.stringify(s.shirts || []),
      JSON.stringify(s.pants || []),
      JSON.stringify(s.items || []),
      s.paymentStatus,
      s.paidAt || '',
      total // Add total to the last column for human viewing
    ];
  });
  
  sheet.getRange(2, 1, rows.length, 12).setValues(rows);
}

function updateSettingsSheet(settings) {
  const sheet = getOrCreateSheet('Settings');
  sheet.clear();
  sheet.appendRow(['Key', 'Value']);
  sheet.appendRow(['schoolName', settings.schoolName || '']);
  sheet.appendRow(['receiverName', settings.receiverName || '']);
  sheet.appendRow(['lastUpdated', new Date().toISOString()]);
  
  // Note: We don't save the full logo to the Settings sheet cell to avoid cell limit issues
  // The logo is preserved in the FullData A1 JSON blob
}

// ===== Helpers =====

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Create header for Students sheet
    if (name === 'Students') {
      sheet.appendRow(['id', 'refCode', 'title', 'firstName', 'lastName', 'grade', 'shirts', 'pants', 'items', 'paymentStatus', 'paidAt', 'Total (View Only)']);
      sheet.getRange("A1:L1").setFontWeight("bold").setBackground("#f1f5f9");
    }
  }
  
  return sheet;
}

function getDefaultUniforms() {
  return [
    { id: 'u1', type: 'shirt', size: 'S', price: 150 },
    { id: 'u2', type: 'shirt', size: 'M', price: 160 },
    { id: 'u3', type: 'shirt', size: 'L', price: 170 },
    { id: 'u4', type: 'shirt', size: 'XL', price: 180 },
    { id: 'u5', type: 'pants', size: 'S', price: 200 },
    { id: 'u6', type: 'pants', size: 'M', price: 210 },
    { id: 'u7', type: 'pants', size: 'L', price: 220 },
    { id: 'u8', type: 'pants', size: 'XL', price: 230 }
  ];
}

function getDefaultItems() {
  return [
    { id: 'i0', name: 'บัตรนักเรียน', price: 10, icon: 'ph-id-card' },
    { id: 'i1', name: 'กระเป๋า', price: 350, icon: 'ph-backpack' },
    { id: 'i2', name: 'เข็มกลัด', price: 50, icon: 'ph-medal' },
    { id: 'i3', name: 'สมุด (โหล)', price: 120, icon: 'ph-book' }
  ];
}
