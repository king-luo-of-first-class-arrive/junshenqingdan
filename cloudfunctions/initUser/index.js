const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'init';

  if (action === 'createSpace') {
    return createSpace(OPENID, event.name);
  }

  // 默认：确保用户有 personal 空间
  return ensurePersonalSpace(OPENID);
};

async function ensurePersonalSpace(openid) {
  const { data: existing } = await db.collection('spaces')
    .where({ ownerId: openid, type: 'personal' }).get();

  if (existing.length > 0) {
    return { spaceId: existing[0]._id, openid };
  }

  const { _id } = await db.collection('spaces').add({
    data: {
      name: '个人',
      type: 'personal',
      ownerId: openid,
      members: [{ userId: openid, role: 'owner', joinedAt: new Date() }],
      createdAt: new Date()
    }
  });

  // 创建默认清单
  await db.collection('lists').add({
    data: { spaceId: _id, name: '待办', color: '#07c160', icon: '', sort: 1.0, createdAt: new Date() }
  });

  return { spaceId: _id, openid };
}

async function createSpace(openid, name) {
  const { _id } = await db.collection('spaces').add({
    data: {
      name,
      type: 'shared',
      ownerId: openid,
      members: [{ userId: openid, role: 'owner', joinedAt: new Date() }],
      createdAt: new Date()
    }
  });

  return { spaceId: _id };
}
