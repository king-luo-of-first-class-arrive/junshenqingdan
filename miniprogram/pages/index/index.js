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

  onShow() {
    this.setData({ today: this.formatDate(new Date()) });
    this.loadSpace();
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
    } else {
      this.loadPersonalSpace();
    }
  },

  async loadPersonalSpace() {
    const { result } = await wx.cloud.callFunction({ name: 'initUser' });
    if (result && result.spaceId) {
      app.setCurrentSpace(result.spaceId, '个人');
      this.setData({ currentSpaceName: '个人' });
    }
  },

  onSpaceSwitch() {
    wx.navigateTo({ url: '/pages/spaces/spaces?action=switch' });
  },

  async fetchToday() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) return;
    const todayStr = this.data.today;

    const { data: lists } = await db.collection('lists')
      .where({ spaceId }).orderBy('sort', 'asc').get();

    const tasksRes = await db.collection('tasks')
      .where({ spaceId, dueDate: todayStr }).orderBy('sort', 'asc').get();

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
  },

  async generateDailyTasks() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) return;
    try {
      await wx.cloud.callFunction({
        name: 'generateDailyTasks',
        data: { spaceId, date: this.data.today }
      });
      this.fetchToday();
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

    await db.collection('tasks').add({
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
    this.setData({ addingToList: '', newTaskTitle: '' });
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
