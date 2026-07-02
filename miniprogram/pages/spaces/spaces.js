const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    spaces: [],
    showCreate: false,
    newSpaceName: ''
  },

  onShow() {
    this.fetchSpaces();
  },

  async fetchSpaces() {
    const { data } = await db.collection('spaces').get();
    this.setData({ spaces: data });
  },

  onSwitchSpace(e) {
    const { id, name } = e.currentTarget.dataset;
    app.setCurrentSpace(id, name);
    wx.switchTab({ url: '/pages/index/index' });
  },

  onSpaceDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/space/space?id=' + id });
  },

  onCreateTap() {
    this.setData({ showCreate: true, newSpaceName: '' });
  },

  async onConfirmCreate() {
    const name = this.data.newSpaceName.trim();
    if (!name) return;

    const { result } = await wx.cloud.callFunction({
      name: 'initUser',
      data: { action: 'createSpace', name }
    });

    if (result && result.spaceId) {
      app.setCurrentSpace(result.spaceId, name);
      this.setData({ showCreate: false, newSpaceName: '' });
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onNameInput(e) {
    this.setData({ newSpaceName: e.detail.value });
  },

  onCancelCreate() {
    this.setData({ showCreate: false, newSpaceName: '' });
  }
});
