const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

/**
 * 扫描当前空间的周期性任务，生成从 startDate 到今天的所有未生成任务实例
 * 靠 generated_tasks 集合的复合唯一索引防重
 *
 * 唯一索引: db.collection('generated_tasks').createIndex({ recurringTaskId: 1, date: 1 }, { unique: true })
 */
exports.main = async (event, context) => {
  const { spaceId, date } = event;
  const { OPENID } = cloud.getWXContext();

  await assertAccess(spaceId, OPENID);

  const targetDate = new Date(date);
  targetDate.setHours(23, 59, 59, 999);

  const { data: recurringTasks } = await db.collection('recurring')
    .where({ spaceId, enabled: true })
    .get();

  let generated = 0;
  for (const rt of recurringTasks) {
    const start = new Date(rt.startDate);
    start.setHours(0, 0, 0, 0);

    // 从 startDate 到今天，最多回溯 7 天
    const checkDate = new Date(start);
    const maxDate = new Date(targetDate);
    const sevenDaysAgo = new Date(targetDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (checkDate < sevenDaysAgo) checkDate.setTime(sevenDaysAgo.getTime());

    while (checkDate <= maxDate) {
      if (matchesRule(rt, checkDate)) {
        const dateStr = formatDate(checkDate);
        const taskId = await maybeGenerateTask(spaceId, rt, dateStr);
        if (taskId) generated++;
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
  }

  return { generated };
};

function matchesRule(rt, date) {
  switch (rt.ruleType) {
    case 'daily':
      return true;
    case 'weekly': {
      const days = (rt.ruleValue || '').split(',').map(Number);
      return days.includes(date.getDay());
    }
    case 'monthly': {
      const day = parseInt(rt.ruleValue) || 1;
      return date.getDate() === day;
    }
    case 'yearly': {
      const parts = (rt.ruleValue || '1-1').split('-');
      const m = parseInt(parts[0]) || 1;
      const d = parseInt(parts[1]) || 1;
      return date.getMonth() + 1 === m && date.getDate() === d;
    }
    default:
      return false;
  }
}

async function maybeGenerateTask(spaceId, rt, dateStr) {
  try {
    // 靠唯一索引防重 — 如果已存在则抛异常跳过
    await db.collection('generated_tasks').add({
      data: { recurringTaskId: rt._id, date: dateStr }
    });

    const { data: existing } = await db.collection('tasks')
      .where({ listId: rt.listId || _.eq(null) })
      .orderBy('sort', 'desc').limit(1).get();
    const sort = existing.length > 0 ? (existing[0].sort || 0) + 1.0 : 1.0;

    const res = await db.collection('tasks').add({
      data: {
        spaceId,
        listId: rt.listId || '',
        title: rt.title,
        note: rt.note || '',
        done: false,
        completedAt: null,
        dueDate: dateStr,
        priority: rt.priority || 0,
        sort,
        creatorId: '',
        createdAt: new Date()
      }
    });

    return res._id;
  } catch (e) {
    // 唯一索引冲突 — 已生成过，跳过
    return null;
  }
}

async function assertAccess(spaceId, openid) {
  const { data: space } = await db.collection('spaces').doc(spaceId).get();
  if (!space) throw new Error('空间不存在');
  const member = (space.members || []).find(m => m.userId === openid);
  if (!member) throw new Error('无权访问');
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
