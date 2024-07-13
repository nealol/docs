import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { createInterface } from 'readline'
import { join } from 'path'

type CommandFile = {
    originalPath: string
    filename: string
    primaryAlias: string
    byline: string
    usage: string
    aliases: string[]
    added: string
    changelog: Map<string, string>
    description: string
}

const commandFiles = new Map<string, CommandFile>()

export const generate = async (cwd: string, args: string[]) => {
    await readFolder(join(cwd, '../apps/lilith/src/commands/implementations'), null)
    commandFiles.forEach((commandFile) => {
        if (commandFile.primaryAlias !== '') {
            console.log(`Generating MDX for ${commandFile.originalPath}`)
            console.log(`Writing to ${join(cwd, 'commands', commandFile.filename)}`)
            fsp.writeFile(join(cwd, 'commands', commandFile.filename), generateMDX(commandFile))
        }
    })
}

function generateMDX(commandFile: CommandFile) {
    return `---
title: /${commandFile.primaryAlias}
description: ${commandFile.byline}
---

## Description

${commandFile.description.trim()}

## Usage

${commandFile.usage.trim()}

## Aliases

${commandFile.aliases.map(alias => '`/' + alias + '`').join(', \n')}

## Changelog

<Steps>
    <Step title="${commandFile.added}" icon="code-branch">
        Added \`/${commandFile.primaryAlias}\`.
    </Step>${Array.from(commandFile.changelog).map(([version, changes]) => `
    <Step title="${version}" icon="code-merge">
${changes.split('\n').map(change => `        ${change}`).join('\n').trimEnd()}
    </Step>`).join('')}
</Steps>
`
}

async function readFolder(path: string, suffix: string | null) {
    const files = await fsp.readdir(suffix != null ? join(path, suffix) : path, { withFileTypes: true })
    for (const file of files) {
        if (file.isDirectory()) {
            await readFolder(path, file.name)
        } else {
            const filePath = join(suffix != null ? join(path, suffix, file.name) : join(path, file.name))
            const rl = createInterface({
                input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
                output: process.stdout,
                terminal: false
            })

            const commandFile: CommandFile = {
                originalPath: filePath,
                filename: file.name.split('.')[0] + '.mdx',
                primaryAlias: '',
                byline: '',
                usage: '',
                aliases: [],
                added: '',
                changelog: new Map(),
                description: ''
            }

            let enteredComment = false

            let inDescription = false
            let inChangelog = ''

            for await (const line of rl) {
                if (line.startsWith('/**')) {
                    enteredComment = true
                } else {
                    if (!enteredComment) continue
                }

                if (line.startsWith(' */')) {
                    inDescription = false
                    inChangelog = ''
                    rl.close()
                    break
                } else if (line.startsWith(' * Filename: ')) {
                    commandFile.filename = line.split(' ')[3]
                } else if (line.startsWith(' * Command: ')) {
                    commandFile.primaryAlias = line.split(' ').slice(3).join(' ')
                    commandFile.aliases = [commandFile.primaryAlias]
                } else if (line.startsWith(' * Byline: ')) {
                    commandFile.byline = line.split(' ').slice(3).join(' ')
                } else if (line.startsWith(' * Usage: ')) {
                    commandFile.usage = line.split(' ').slice(3).join(' ')
                } else if (line.startsWith(' * Aliases: ')) {
                    commandFile.aliases.push(...line.split(' ').slice(3).join(' ').split(', '))
                } else if (line.startsWith(' * Added: ')) {
                    commandFile.added = line.split(' ').slice(3).join(' ')
                } else if (line.startsWith(' * Changelog - ')) {
                    inDescription = false
                    inChangelog = line.split(' ').slice(4).join(' ').slice(0, -1)
                    commandFile.changelog.set(inChangelog, '')
                } else if (line.startsWith(' * Description:')) {
                    inChangelog = ''
                    inDescription = true
                    commandFile.description = ''
                } else if (inChangelog) {
                    commandFile.changelog.set(inChangelog, commandFile.changelog.get(inChangelog) + line.slice(3) + '\n')
                } else if (inDescription) {
                    commandFile.description += line.slice(3) + '\n'
                }
            }

            commandFiles.set(commandFile.filename, commandFile)

        }
    }
}