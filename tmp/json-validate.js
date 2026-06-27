var fso = new ActiveXObject('Scripting.FileSystemObject');
var path = 'C:/Users/beson/OneDrive/Dokumente/Coding/faigata/messages/en.json';
var file = fso.OpenTextFile(path, 1);
var raw = file.ReadAll();
file.Close();
try {
  JSON.parse(raw);
  WScript.Echo('JSON OK');
} catch (e) {
  WScript.Echo('JSON FAIL');
  WScript.Echo(e.message);
}
