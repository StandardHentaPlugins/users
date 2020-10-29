export default class HentadminBridge {
  henta: any;

  constructor(henta) {
    this.henta = henta;
  }

  init(henta) {
    const hentadminPlugin = henta.getPlugin('common/hentadmin');
    const usersPlugin = this.henta.getPlugin('common/users');
    hentadminPlugin.setStatsSource('users:total', 'number', async () => {
      return {
        series: [
          {
            name: 'Аккаунтов в боте',
            data: await usersPlugin.User.count()
          }
        ]
      }
    })
  }
}
