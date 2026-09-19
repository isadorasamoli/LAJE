const fs = require('fs');
let code = fs.readFileSync('src/components/AdminSettings.tsx', 'utf8');

// Update deleteDoc to log the error
code = code.replace(
  'console.error(err);',
  'console.error("ERRO AO DELETAR:", err); toast.error("Erro: " + (err.message || "desconhecido"));'
);

fs.writeFileSync('src/components/AdminSettings.tsx', code);
