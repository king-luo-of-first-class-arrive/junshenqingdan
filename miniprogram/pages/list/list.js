const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const { calcSort, formatDate } = require('../../utils/permission');

Page({
  data: {
    listId: '',
    list: null,
    tasks: [],
    adding: false,
    newTaskTitle: '',
    editingTask: null,
    editTitle: '',
    editNote: ''
  },

  onLoad(options) {
    this.setData({ listId: options.id });
  },

  onShow() {
    this.fetchList();
    this.fetchTasks();
  },

  async fetchList() {
    const { data: list } = await db.collection('lists').doc(this.data.listId).get();
    if (list) {
      wx.setNavigationBarTitle({ title: list.name });
      this.setData({ list });
    }
  },

  async fetchTasks() {
    const { data: tasks } = await db.collection('tasks')
      .where({ listId: this.data.listId })
      .orderBy('sort', 'asc')
      .get();
    this.setData({ tasks });
  },

  async onToggleTask(e) {
    const { id, done } = e.currentTarget.dataset;
    await db.collection('tasks').doc(id).update({
      data: { done: !done, completedAt: !done ? new Date() : null }
    });
    this.fetchTasks();
  },

  onAddTap() {
    this.setData({ adding: true, newTaskTitle: '' });
  },

  async onConfirmAdd() {
    const title = this.data.newTaskTitle.trim();
    if (!title) return;
    const sort = calcSort(this.data.tasks, 'last');
    const spaceId = this.data.list.spaceId;

    await db.collection('tasks').add({
      data: {
        spaceId,
        listId: this.data.listId,
        title,
        note: '',
        done: false,
        completedAt: null,
        dueDate: formatDate(new Date()),
        priority: 0,
        sort,
        creatorId: '',
        createdAt: new Date()
      }
    });
    this.setData({ adding: false, newTaskTitle: '' });
    this.fetchTasks();
  },

  onEditTask(e) {
    const task = this.data.tasks.find(t => t._id === e.currentTarget.dataset.id);
    if (task) {
      this.setData({
        editingTask: task,
        editTitle: task.title,
        editNote: task.note || ''
      });
    }
  },

  async onSaveEdit() {
    const task = this.data.editingTask;
    if (!task) return;
    await db.collection('tasks').doc(task._id).update({
      data: {
        title: this.data.editTitle.trim(),
        note: this.data.editNote.trim()
      }
    });
    this.setData({ editingTask: null, editTitle: '', editNote: '' });
    this.fetchTasks();
  },

  async onDeleteTask(e) {
    const id = e.currentTarget.dataset.id;
    const res = await new Promise(r => wx.showModal({
      title: '确认删除', content: '删除后不可恢复', success: r
    }));
    if (!res.confirm) return;
    await db.collection('tasks').doc(id).remove();
    this.fetchTasks();
  },

  onCancelEdit() {
    this.setData({ editingTask: null, editTitle: '', editNote: '' });
  },

  onTaskInput(e) {
    this.setData({ newTaskTitle: e.detail.value });
  },

  onCancelAdd() {
    this.setData({ adding: false, newTaskTitle: '' });
  },

  onEditTitleInput(e) {
    this.setData({ editTitle: e.detail.value });
  },

  onEditNoteInput(e) {
    this.setData({ editNote: e.detail.value });
  }
});
