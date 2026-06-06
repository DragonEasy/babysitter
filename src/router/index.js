import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: '宝宝管家', icon: 'home' }
  },
  {
    path: '/dashboard/:type',
    name: 'DetailList',
    component: () => import('../views/DetailListView.vue'),
    props: true
  },
  {
    path: '/photos',
    name: 'Photos',
    component: () => import('../views/PhotosView.vue'),
    meta: { title: '宝宝相册', icon: 'photos' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '设置', icon: 'settings' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  document.title = to.meta.title || '宝宝管家'
})

export default router
