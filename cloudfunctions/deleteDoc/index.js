const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event) => {
  const { collection, id } = event;
  await db.collection(collection).doc(id).remove();
  return { ok: true };
};
