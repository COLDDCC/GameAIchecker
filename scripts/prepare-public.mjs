import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(), out=join(root,'public');mkdirSync(out,{recursive:true});
for(const dir of ['data','assets','images','img']){const source=join(root,dir),target=join(out,dir);if(existsSync(source)){rmSync(target,{recursive:true,force:true});cpSync(source,target,{recursive:true});}}
