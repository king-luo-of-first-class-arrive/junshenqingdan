const app = getApp();
const db = wx.cloud.database();

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getRuleDesc(task) {
  let desc = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[task.ruleType] || task.ruleType;
  if (task.ruleType === 'weekly' && task.ruleValue) {
    const days = task.ruleValue.split(',').map(d => WEEKDAYS[parseInt(d)]).join('、');
    desc += ' ' + days;
  }
  if (task.ruleType === 'monthly' && task.ruleValue) {
    desc += ' ' + task.ruleValue + '号';
  }
  return desc;
}

Page({
  data: {
    recurringTasks: [],
    lists: [],
    showForm: false,
    editingId: '',
    form: {
      title: '', note: '', priority: 0,
      ruleType: 'daily', ruleValue: '', selectedWeekdays: [], listId: ''
    },
    weekdays: WEEKDAYS
  },

  onShow() {
    this.fetchRecurring();
    this.fetchLists();
  },

  async fetchRecurring() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) return;
    const { data } = await db.collection('recurring')
      .where({ spaceId, enabled: true })
      .orderBy('createdAt', 'desc')
      .get();
    const tasks = data.map(t => ({ ...t, ruleDesc: getRuleDesc(t) }));
    this.setData({ recurringTasks: tasks });
  },

  async fetchLists() {
    const spaceId = app.globalData.currentSpaceId;
    if (!spaceId) return;
    const { data } = await db.collection('lists')
      .where({ spaceId }).orderBy('sort', 'asc').get();
    this.setData({ lists: data });
  },

  onAddTap() {
    this.setData({
      showForm: true, editingId: '',
      form: { title: '', note: '', priority: 0, ruleType: 'daily',
        ruleValue: '', selectedWeekdays: [], listId: '' }
    });
  },

  onEditTap(e) {
    const task = this.data.recurringTasks.find(t => t._id === e.currentTarget.dataset.id);
    if (!task) return;
    this.setData({
      showForm: true, editingId: task._id,
      form: {
        title: task.title, note: task.note || '', priority: task.priority || 0,
        ruleType: task.ruleType, ruleValue: task.ruleValue || '',
        selectedWeekdays: task.ruleType === 'weekly'
          ? (task.ruleValue || '').split(',').filter(Boolean) : [],
        listId: task.listId || ''
      }
    });
  },

  onSelectRule(e) {
    this.setData({ 'form.ruleType': e.currentTarget.dataset.type });
  },

  onToggleWeekday(e) {
    const day = e.currentTarget.dataset.day;
    let days = [...this.data.form.selectedWeekdays];
    const idx = days.indexOf(day);
    if (idx > -1) days.splice(idx, 1); else days.push(day);
    this.setData({ 'form.selectedWeekdays': days });
  },

  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }); },
  onNoteInput(e) { this.setData({ 'form.note': e.detail.value }); },
  onDayInput(e) { this.setData({ 'form.ruleValue': e.detail.value }); },

  onPickList(e) {
    const list = this.data.lists[e.detail.value];
    this.setData({ 'form.listId': list ? list._id : '' });
  },

  async onSave() {
    const { form, editingId } = this.data;
    if (!form.title.trim()) return;
    const spaceId = app.globalData.currentSpaceId;
    let ruleValue = form.ruleValue;
    if (form.ruleType === 'weekly') ruleValue = form.selectedWeekdays.sort().join(',');
    if (form.ruleType === 'monthly' && !ruleValue) ruleValue = '1';

    const doc = {
      spaceId, listId: form.listId,
      title: form.title.trim(), note: form.note.trim(),
      priority: form.priority, ruleType: form.ruleType, ruleValue, enabled: true
    };
    if (!editingId) {
      doc.startDate = new Date();
      doc.createdAt = new Date();
    }

    if (editingId) {
      await db.collection('recurring').doc(editingId).update({ data: doc });
    } else {
      await db.collection('recurring').add({ data: doc });
    }
    this.setData({ showForm: false });
    this.fetchRecurring();
  },

  async onDelete(e) {
    const res = await new Promise(r => wx.showModal({
      title: '确认删除', content: '删除此周期任务？', success: r
    }));
    if (!res.confirm) return;
    await db.collection('recurring').doc(e.currentTarget.dataset.id).remove();
    this.fetchRecurring();
  },

  onCancel() { this.setData({ showForm: false, editingId: '' }); }
});
