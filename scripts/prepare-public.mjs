import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(), out=join(root,'public');mkdirSync(out,{recursive:true});
for(const dir of ['data','assets','images','img']){const source=join(root,dir),target=join(out,dir);if(existsSync(source)){if(dir!=='images'){rmSync(target,{recursive:true,force:true});}mkdirSync(target,{recursive:true});cpSync(source,target,{recursive:true,force:true});}}
rmSync(join(out,'data','steam'),{recursive:true,force:true});
