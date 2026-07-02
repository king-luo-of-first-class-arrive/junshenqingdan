const db = wx.cloud.database();
const _ = db.command;

/**
 * 云函数端权限校验 — 调用云函数时需传入 spaceId，云函数内调用此函数校验
 * 小程序端通过 getSpaceMembers 判断
 */
async function assertUserCanAccessSpace(spaceId, openid) {
  const res = await db.collection('spaces').doc(spaceId).get();
  if (!res.data) throw new Error('空间不存在');

  const space = res.data;
  const member = (space.members || []).find(m => m.userId === openid);
  if (!member) throw new Error('无权访问此空间');

  return space;
}

function assertIsOwner(space, openid) {
  const self = (space.members || []).find(m => m.userId === openid);
  if (!self || self.role !== 'owner') throw new Error('仅空间所有者可执行此操作');
}

/** 浮点插入法计算新任务的 sort 值 */
function calcSort(existingTasks, position) {
  if (!existingTasks || existingTasks.length === 0) return 1.0;

  const sorted = existingTasks
    .map(t => t.sort || 0)
    .sort((a, b) => a - b);

  if (position === 'first') return sorted[0] / 2;
  if (position === 'last') return sorted[sorted.length - 1] + 1.0;

  // 默认追加到末尾
  return sorted[sorted.length - 1] + 1.0;
}

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return formatDate(new Date());
}

module.exports = {
  assertUserCanAccessSpace,
  assertIsOwner,
  calcSort,
  formatDate,
  todayStr
};