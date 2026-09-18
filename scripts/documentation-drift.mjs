import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

const since='24 hours ago';
const out=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const commitsRaw=out(['log','--since='+since,'--pretty=format:%H%x09%s']);
const filesRaw=out(['log','--since='+since,'--name-only','--pretty=format:']);
const commits=commitsRaw?commitsRaw.split('\n').filter(Boolean):[];
const files=[...new Set((filesRaw?filesRaw.split('\n'):[]).map(x=>x.trim()).filter(Boolean))];
const meaningful=files.filter(f=>!/^docs\//.test(f)&&!/^brand\//.test(f)&&!/^\.agents\//.test(f)&&!/^README\.md$/.test(f));
const docFiles=files.filter(f=>/^docs\//.test(f)||/^brand\//.test(f)||/^\.agents\//.test(f)||/^README\.md$/.test(f));
const report=['# Documentation Drift Report','', 'Generated: '+new Date().toISOString(),'','## Last 24 hours','', '- Commits: **'+commits.length+'**','- Changed files: **'+files.length+'**','- Non-documentation files: **'+meaningful.length+'**','- Documentation/skills/brand files: **'+docFiles.length+'**','', meaningful.length?'## Non-documentation changes\n\n'+meaningful.map(f=>'- `'+f+'`').join('\n'):'## Non-documentation changes\n\nNone.','', commits.length?'## Commits\n\n'+commits.map(c=>'- '+c).join('\n'):'## Commits\n\nNone.','', meaningful.length&&!docFiles.length?'> **Documentation review required:** code/config changed during the period but no documentation/skill/brand file changed.':'> Documentation activity is consistent with the observed change window.',''].join('\n');
await fs.writeFile('documentation-drift-report.md',report);
console.log(report);
