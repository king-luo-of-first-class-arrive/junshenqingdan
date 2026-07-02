const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentSpaceName: '个人',
    lists: [],
    tasksByList: {},
    today: ''
  },

  async onShow() {
    this.setData({ today: this.formatDate(new Date()) });
    await this.loadSpace();
    this.fetchToday();
    this.generateDailyTasks();
  },

  onPullDownRefresh() {
    this.fetchToday().then(() => wx.stopPullDownRefresh());
  },

  loadSpace() {
    const id = app.globalData.currentSpaceId;
    const name = app.globalData.currentSpaceName;
    if (id) {
      this.setData({ currentSpaceName: name || '共享空间' });
      return Promise.resolve();
    }
    return this.loadPersonalSpace();
  },

  async loadPersonalSpace() {
    try {
      const res = await wx.cloud.callFunction({ name: 'initUser' });
      console.log('[loadPersonalSpace] cloud response:', JSON.stringify(res));
      if (res.result && res.result.spaceId) {
        app.setCurrentSpace(res.result.spaceId, '个人');
        this.setData({ currentSpaceName: '个人' });
        return;
      }
      // ponytail: 云函数旧版未返回 spaceId，客户端自行处理
      const openId = res.result.userInfo && res.result.userInfo.openId;
      if (!openId) {
        console.error('[loadPersonalSpace] 无 openId:', JSON.stringify(res));
        return;
      }
      // 查已有个人空间
      const { data: spaces } = await db.collection('spaces')
        .where({ ownerId: openId, type: 'personal' }).get();
      let spaceId;
      if (spaces.length > 0) {
        spaceId = spaces[0]._id;
      } else {
        // 新建个人空间 + 默认清单
        const addRes = await db.collection('spaces').add({
          data: {
            name: '个人', type: 'personal', ownerId: openId,
            members: [{ userId: openId, role: 'owner', joinedAt: new Date() }],
            createdAt: new Date()
          }
        });
        spaceId = addRes._id;
        await db.collection('lists').add({
          data: { spaceId, name: '待办', color: '#07c160', icon: '', sort: 1.0, createdAt: new Date() }
        });
      }
      app.setCurrentSpace(spaceId, '个人');
      this.setData({ currentSpaceName: '个人' });
    } catch (e) {
      console.error('[loadPersonalSpace] 云函数调用失败:', e);
    }
  },

  onSpaceSwitch() {
    wx.navigateTo({ url: '/pages/spaces/spaces?action=switch' });
  },

  async fetchToday() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) {
      console.warn('[fetchToday] spaceId 为空，跳过');
      return;
    }
    const todayStr = this.data.today;
    console.log('[fetchToday] spaceId=', spaceId, 'today=', todayStr);

    try {
      const { data: lists } = await db.collection('lists')
        .where({ spaceId }).orderBy('sort', 'asc').get();
      console.log('[fetchToday] lists count=', lists.length);

      const tasksRes = await db.collection('tasks')
        .where({ spaceId, dueDate: todayStr }).orderBy('sort', 'asc').get();
      console.log('[fetchToday] tasks count=', tasksRes.data.length);

      const tasksByList = {};
      for (const list of lists) {
        tasksByList[list._id] = { list, tasks: [] };
      }
      tasksByList['_none'] = { list: { _id: '_none', name: '未分类', color: '#ccc' }, tasks: [] };

      for (const t of tasksRes.data) {
        const lid = t.listId || '_none';
        if (tasksByList[lid]) {
          tasksByList[lid].tasks.push(t);
        } else {
          tasksByList['_none'].tasks.push(t);
        }
      }

      this.setData({ lists, tasksByList });
    } catch (e) {
      console.error('[fetchToday] 查询失败:', e);
    }
  },

  async generateDailyTasks() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) return;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'generateDailyTasks',
        data: { spaceId, date: this.data.today }
      });
      if (result && result.generated > 0) {
        this.fetchToday();
      }
    } catch (e) {
      // 每日已生成过则忽略
    }
  },

  async onToggleTask(e) {
    const { id, done } = e.currentTarget.dataset;
    await db.collection('tasks').doc(id).update({
      data: { done: !done, completedAt: !done ? new Date() : null }
    });
    this.fetchToday();
  },

  async onDeleteTask(e) {
    const id = e.currentTarget.dataset.id;
    const res = await new Promise(r => wx.showModal({
      title: '确认删除', content: '删除后不可恢复', success: r
    }));
    if (!res.confirm) return;
    await wx.cloud.callFunction({ name: 'deleteDoc', data: { collection: 'tasks', id } });
    this.fetchToday();
  },

  onAddTask(e) {
    const listId = e.currentTarget.dataset.listid;
    this.setData({ addingToList: listId, newTaskTitle: '' });
  },

  async onConfirmAdd() {
    const title = this.data.newTaskTitle;
    if (!title.trim()) return;
    const spaceId = app.globalData.currentSpaceId;
    const rawListId = this.data.addingToList;
    const listId = (rawListId === '_none' || rawListId === '_fab') ? '' : rawListId;

    const { data: existing } = await db.collection('tasks')
      .where({ listId: listId || _.eq(null) }).orderBy('sort', 'desc').limit(1).get();
    const sort = existing.length > 0 ? (existing[0].sort || 0) + 1.0 : 1.0;

    const addRes = await db.collection('tasks').add({
      data: {
        spaceId,
        listId: listId || '',
        title: title.trim(),
        note: '',
        done: false,
        completedAt: null,
        dueDate: this.data.today,
        priority: 0,
        sort,
        creatorId: '',
        createdAt: new Date()
      }
    });

    // 乐观更新 — 先加到本地，不等 DB 回查
    const newTask = { _id: addRes._id, spaceId, listId: listId || '', title: title.trim(), note: '', done: false, completedAt: null, dueDate: this.data.today, priority: 0, sort, creatorId: '', createdAt: new Date() };
    const lid = newTask.listId || '_none';
    const tasksByList = { ...this.data.tasksByList };
    if (tasksByList[lid]) {
      const group = tasksByList[lid];
      tasksByList[lid] = { list: group.list, tasks: [...group.tasks, newTask] };
    } else {
      tasksByList['_none'] = tasksByList['_none'] || { list: { _id: '_none', name: '未分类', color: '#ccc' }, tasks: [] };
      tasksByList['_none'] = { ...tasksByList['_none'], tasks: [...tasksByList['_none'].tasks, newTask] };
    }
    this.setData({ addingToList: '', newTaskTitle: '', tasksByList });
    this.fetchToday();
  },

  onTaskTitleInput(e) {
    this.setData({ newTaskTitle: e.detail.value });
  },

  onCancelAdd() {
    this.setData({ addingToList: '', newTaskTitle: '' });
  },

  onFabAdd() {
    this.setData({ addingToList: '_fab', newTaskTitle: '' });
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
});
