const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    spaceId: '',
    space: null,
    lists: [],
    members: [],
    isOwner: false,
    inviteCode: '',
    showCreateList: false,
    newListName: '',
    newListColor: '#07c160',
    showJoin: false,
    joinCode: ''
  },

  onLoad(options) {
    this.setData({ spaceId: options.id });
  },

  onShow() {
    this.fetchSpace();
    this.fetchLists();
  },

  async fetchSpace() {
    try {
      const { data: space } = await db.collection('spaces').doc(this.data.spaceId).get();
      if (space) {
        const members = space.members || [];
        const { result } = await wx.cloud.callFunction({ name: 'initUser', data: {} });
        const openid = (result && result.openid) || '';
        const self = members.find(m => m.userId === openid);
        this.setData({
          space,
          members,
          isOwner: !!(self && self.role === 'owner')
        });
      }
    } catch (e) {
      wx.showToast({ title: '加载空间信息失败', icon: 'none' });
    }
  },

  async fetchLists() {
    try {
      const { data } = await db.collection('lists')
        .where({ spaceId: this.data.spaceId })
        .orderBy('sort', 'asc')
        .get();
      this.setData({ lists: data });
    } catch (e) {
      wx.showToast({ title: '加载清单失败，请检查数据库权限', icon: 'none' });
    }
  },

  async onGenerateInvite() {
    wx.showLoading({ title: '生成中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'manageInvite',
        data: { action: 'create', spaceId: this.data.spaceId }
      });
      wx.hideLoading();
      if (result && result.code) {
        this.setData({ inviteCode: result.code });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  async onJoinByCode() {
    const code = this.data.joinCode.trim();
    if (!code) return;
    wx.showLoading({ title: '加入中' });
    try {
      await wx.cloud.callFunction({
        name: 'manageInvite',
        data: { action: 'accept', code }
      });
      wx.hideLoading();
      wx.showToast({ title: '加入成功' });
      this.setData({ showJoin: false, joinCode: '' });
      this.fetchSpace();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '邀请码无效或已过期', icon: 'none' });
    }
  },

  async onRemoveMember(e) {
    const userId = e.currentTarget.dataset.uid;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'manageInvite',
        data: { action: 'removeMember', spaceId: this.data.spaceId, userId }
      });
      if (result && result.ok) this.fetchSpace();
    } catch (e) {
      wx.showToast({ title: '移除失败', icon: 'none' });
    }
  },

  async onDeleteSpace() {
    const res = await new Promise(r => wx.showModal({
      title: '确认删除',
      content: '删除空间将同时删除其中的所有清单和任务，不可恢复。',
      success: r
    }));
    if (!res.confirm) return;
    await db.collection('spaces').doc(this.data.spaceId).remove();
    wx.showToast({ title: '已删除' });
    setTimeout(() => wx.switchTab({ url: '/pages/spaces/spaces' }), 1000);
  },

  onCreateListTap() {
    this.setData({ showCreateList: true, newListName: '', newListColor: '#07c160' });
  },

  async onConfirmCreateList() {
    const name = this.data.newListName.trim();
    if (!name) return;
    try {
      const { data: existing } = await db.collection('lists')
        .where({ spaceId: this.data.spaceId }).orderBy('sort', 'desc').limit(1).get();
      const sort = existing.length > 0 ? (existing[0].sort || 0) + 1.0 : 1.0;

      await db.collection('lists').add({
        data: {
          spaceId: this.data.spaceId,
          name,
          color: this.data.newListColor,
          icon: '',
          sort,
          createdAt: new Date()
        }
      });
      this.setData({ showCreateList: false, newListName: '' });
      wx.showToast({ title: '清单已创建' });
      this.fetchLists();
    } catch (e) {
      wx.showToast({ title: '创建失败，请检查数据库权限', icon: 'none' });
    }
  },

  onListTap(e) {
    wx.navigateTo({ url: '/pages/list/list?id=' + e.currentTarget.dataset.id });
  },

  onListNameInput(e) { this.setData({ newListName: e.detail.value }); },
  onCancelCreateList() { this.setData({ showCreateList: false, newListName: '' }); },
  onPickColor(e) { this.setData({ newListColor: e.currentTarget.dataset.color }); },
  onTapJoin() { this.setData({ showJoin: true, joinCode: '' }); },
  onCancelJoin() { this.setData({ showJoin: false, joinCode: '' }); },
  onJoinCodeInput(e) { this.setData({ joinCode: e.detail.value }); }
});
