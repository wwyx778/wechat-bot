import { remark } from 'remark'
import stripMarkdown from 'strip-markdown'
import OpenAI from 'openai'
import dotenv from 'dotenv'
const env = dotenv.config().parsed // 环境参数
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.resolve()
const doubaoDir = path.dirname(fileURLToPath(import.meta.url))

/** 读取与本文件同目录下的 SKILL.md 或 skill.md，作为 system 提示词追加内容 */
function readSkillMdPrompt() {
  for (const name of ['SKILL.md', 'skill.md']) {
    const p = path.join(doubaoDir, name)
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8').trim()
    }
  }
  return ''
}

const skillSystemPrompt = readSkillMdPrompt()

const memoryMdPath = path.join(doubaoDir, 'Memory.md')

function readMemoryMdForPrompt() {
  if (!fs.existsSync(memoryMdPath)) return ''
  return fs.readFileSync(memoryMdPath, 'utf8').trim()
}

function memoryMessagesFromFile() {
  const text = readMemoryMdForPrompt()
  return text ? [{ role: 'assistant', content: text }] : []
}

/**
 * 在每次对话回复后追加一条记忆（由 wechaty 在 doubao 模式下调用）
 * @param {{ roomName: string | null, senderName: string, question: string }} entry
 */
export function appendDoubaoMemory(entry) {
  const { roomName, senderName, question } = entry
  const scope = roomName ? `群《${roomName}》` : '私聊'
  const safeQ = String(question).replace(/\r?\n/g, ' ').trim()
  const line = `[${new Date().toISOString()}] ${scope} | ${senderName}说: ${safeQ}\n`
  fs.appendFileSync(memoryMdPath, line, 'utf8')
}
// 判断是否有 .env 文件, 没有则报错
const envPath = path.join(__dirname, '.env')
if (!fs.existsSync(envPath)) {
  console.log('❌ 请先根据文档，创建并配置.env文件！')
  process.exit(1)
}

let config = {
  apiKey: env.DOUBAO_API_KEY,
  baseURL: env.DOUBAO_URL,
}
const openai = new OpenAI(config)
const chosen_model = env.DOUBAO_MODEL

function systemMessagesFromSkill() {
  return skillSystemPrompt ? [{ role: 'system', content: skillSystemPrompt }] : []
}

export async function getDoubaoReply(prompt, img_url = '') {
  const only_text = img_url == ''
  console.log('🚀🚀🚀 / prompt', prompt)
  let response
  if (only_text) {
    response = await openai.chat.completions.create({
      messages: [...systemMessagesFromSkill(), ...memoryMessagesFromFile(), { role: 'user', content: [{ type: 'text', text: prompt }] }],
      model: chosen_model,
    })
  } else {
    response = await openai.chat.completions.create({
      messages: [
        ...systemMessagesFromSkill(),
        ...memoryMessagesFromFile(),
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: img_url,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      model: chosen_model,
    })
  }
  console.log('🚀🚀🚀 / reply', response.choices[0].message.content)
  return `${response.choices[0].message.content}`
}
