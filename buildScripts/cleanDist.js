import fs from 'fs'
import path from 'path'

// function deleteFolderContents(folderPath) {
//     const contents = fs.readdirSync(distPath)
//     for (const file of contents) {
//         const path = path.join(folderPath, file)
//         if (fs.statSync(path).isDirectory()) {
//             deleteFolderContents(path)
//         } else {
//             fs.unlinkSync(path)
//         }
//     }
// }
console.log('Cleaning dist folder...')
const distPath = path.join(process.cwd(), 'dist')

const contents = fs.readdirSync(distPath)
for (const entry of contents) {
    const pathToDelete = path.join(distPath, entry)
    console.log('Deleting', pathToDelete)
    fs.rmSync(pathToDelete, { recursive: true, force: true })
    console.log(`Deleted ${pathToDelete}`)
}

console.log('Done!')
process.exit(0)
