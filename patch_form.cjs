const fs = require('fs');
let code = fs.readFileSync('src/components/Form.tsx', 'utf8');

const earlyReturnRegex = /if \(existingResponse && !existingResponse\.editAuthorized\) \{[\s\S]*?return \([\s\S]*?\);\n  \}/;
code = code.replace(earlyReturnRegex, '');

const todayRegex = /const today = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];/;
const replacement = `
  const today = new Date().toISOString().split('T')[0];
  const isReadOnly = existingResponse && !existingResponse.editAuthorized;
`;
code = code.replace(todayRegex, replacement);

const formStartRegex = /<form onSubmit=\{handleSubmit\} className="([^"]+)">/;
code = code.replace(formStartRegex, `<form onSubmit={handleSubmit} className="$1">
      {existingResponse && (
        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] mb-8">
          <div>
            <h3 className="font-['Syne'] uppercase text-[var(--color-ink)] font-bold">Status do Formulário</h3>
            <p className="font-['Space_Mono'] uppercase text-[0.7rem] text-[var(--color-ink-muted)]">
              {isReadOnly ? 'Somente Leitura - Aguardando ou requer autorização' : 'Modo de Edição Autorizado'}
            </p>
          </div>
          {isReadOnly && existingResponse.editRequestStatus === 'pending' ? (
             <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
               <Loader2 className="w-4 h-4 animate-spin" />
               Aguardando RH
             </div>
          ) : isReadOnly ? (
             <button 
               type="button"
               onClick={requestEdit}
               disabled={loading}
               className="px-4 py-2 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none flex items-center gap-2"
             >
               {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
               Solicitar Edição
             </button>
          ) : null}
        </div>
      )}
`);

code = code.replace(/<input /g, '<input disabled={isReadOnly} ');
code = code.replace(/<select /g, '<select disabled={isReadOnly} ');
code = code.replace(/<textarea /g, '<textarea disabled={isReadOnly} ');
code = code.replace(/className="w-full bg-gray-950/g, 'className={`w-full bg-transparent ${isReadOnly ? "opacity-50" : ""}`}');

const submitRegex = /<button[\s\S]*?type="submit"[\s\S]*?<\/button>/;
const submitMatch = code.match(submitRegex);
if(submitMatch) {
    code = code.replace(submitRegex, `{ !isReadOnly && (
        <button 
          disabled={loading}
          type="submit"
          className="flex items-center gap-3 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] border-none font-bold px-10 py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase font-['Space_Mono']"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Transmitindo...
            </>
          ) : 'Submeter Dados'}
        </button>
      )}`);
}

// Add the explicit HR email for requests
const rhEmailsRegex = /const rhEmails = rhSnap\.docs\.map\(d => d\.data\(\)\.email\)\.filter\(e => e\);/;
code = code.replace(rhEmailsRegex, `const rhEmails = Array.from(new Set([...rhSnap.docs.map(d => d.data().email).filter(e => e), 'isadorasdml@gmail.com']));`);

fs.writeFileSync('src/components/Form.tsx', code);
