import { json, requireAuth } from '../utils/shared.js'

export async function onRequest({ request, env }) {
  const denied = await requireAuth(request, env)
  if (denied) return denied
  return json({
    ok: true,
    templates: [
      { name: '家庭常备', category: '家庭常备', tags: ['OTC'] },
      { name: '感冒发热', category: '感冒发热', tags: ['OTC', '内服药'] },
      { name: '消毒护理', category: '消毒护理', tags: ['外用药'] },
      { name: '儿童用药', category: '儿童用药', tags: ['儿童药'] }
    ]
  })
}
