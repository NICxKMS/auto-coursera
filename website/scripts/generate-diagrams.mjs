import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { basename, join } from 'path';

const diagramsDir = join(import.meta.dirname, '../src/diagrams');
const outputDir = join(import.meta.dirname, '../public/diagrams');

// Ensure output directory exists
execSync(`mkdir -p ${outputDir}`);

const files = readdirSync(diagramsDir).filter((f) => f.endsWith('.mmd'));

for (const file of files) {
	const input = join(diagramsDir, file);
	const output = join(outputDir, basename(file, '.mmd') + '.svg');
	console.log(`Rendering ${file} -> ${basename(output)}`);
	execSync(`pnpm exec mmdc -i ${input} -o ${output} -b transparent`, { stdio: 'inherit' });
}
