import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  Database,
  Download,
  LayoutDashboard,
  Menu,
  Repeat,
  Settings,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { TimeFlowProvider, useTimeFlow } from './context/TimeFlowContext';
import { usePWAInstall } from './hooks/usePWA';
import { NavPageId } from './types/timeflow';
import { formatLocalDate } from './utils/stats';
import { BrandLogo } from './components/BrandLogo';
import { Footer } from './components/Footer';
import { DashboardPage } from './pages/DashboardPage';
import { DailyLogPage } from './pages/DailyLogPage';
import { DiaryPage } from './pages/DiaryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReviewPage } from './pages/ReviewPage';
import { AIAnalysisPage } from './pages/AIAnalysisPage';
import { DataCenterPage } from './pages/DataCenterPage';
import { SettingsPage } from './pages/SettingsPage';

interface NavItem {
  id: NavPageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '首页', icon: LayoutDashboard },
  { id: 'daily-log', label: '每日记录', icon: Clock },
  { id: 'diary', label: '日记', icon: BookOpen },
  { id: 'analytics', label: '时间分析', icon: BarChart3 },
  { id: 'review-week', label: '周度复盘', icon: CalendarDays },
  { id: 'review-month', label: '月度复盘', icon: Repeat },
  { id: 'review-quarter', label: '季度复盘', icon: Repeat },
  { id: 'review-year', label: '年度复盘', icon: Repeat },
  { id: 'ai-analysis', label: 'AI成长分析', icon: Sparkles },
  { id: 'data-center', label: '数据管理', icon: Database },
  { id: 'settings', label: '设置', icon: Settings },
];

const TimeFlowShell: React.FC = () => {
  const { loading, saveStatus, lastSavedAt, saveMessage, isOnline, offlinePendingCount } =
    useTimeFlow();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [activePage, setActivePage] = useState<NavPageId>('dashboard');
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const navigateTo = (page: NavPageId, date?: string) => {
    if (date) setSelectedDate(date);
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  const renderPage = () => {
    if (loading) {
      return (
        <div className="space-y-4 py-8">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-slate-200" />
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={navigateTo} />;
      case 'daily-log':
        return <DailyLogPage selectedDate={selectedDate} onDateChange={setSelectedDate} />;
      case 'diary':
        return <DiaryPage selectedDate={selectedDate} onDateChange={setSelectedDate} />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'review-week':
        return <ReviewPage periodType="week" />;
      case 'review-month':
        return <ReviewPage periodType="month" />;
      case 'review-quarter':
        return <ReviewPage periodType="quarter" />;
      case 'review-year':
        return <ReviewPage periodType="year" />;
      case 'ai-analysis':
        return <AIAnalysisPage />;
      case 'data-center':
        return <DataCenterPage onNavigate={navigateTo} />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Desktop Left Sidebar (240px) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <BrandLogo />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Sidebar Install + Real Save State */}
        <div className="border-t border-slate-200 p-4 space-y-2.5">
          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={install}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              安装到 Mac 桌面
            </button>
          )}
          {!isInstalled && !isInstallable && isIOS && (
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              添加到主屏幕
            </button>
          )}

          <div className="text-xs text-slate-500">
            {saveStatus === 'saving' && '正在保存至本地...'}
            {saveStatus === 'saved' && lastSavedAt && (
              <span className="tabular-nums">
                {saveMessage} ·{' '}
                {new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
            )}
            {saveStatus === 'error' && <span className="text-red-600">{saveMessage}</span>}
            {saveStatus === 'idle' && 'IndexedDB 本地持久化已就绪'}
          </div>
        </div>
      </aside>

      {/* Mobile Header + Drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden print:hidden">
          <BrandLogo compact />
          <div className="flex items-center gap-2">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white"
              >
                安装应用
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="打开导航菜单"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-900/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-10 flex w-64 flex-col bg-white shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <BrandLogo compact />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                        active
                          ? 'bg-blue-50 font-semibold text-blue-700'
                          : 'font-medium text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-slate-400'}`}
                      />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8 print:px-0 print:py-0">
          {renderPage()}
        </main>

        {(loading || activePage !== 'daily-log') && <Footer />}
      </div>

      {/* Real Offline Mode Indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg print:hidden">
          <WifiOff className="h-3.5 w-3.5" />
          <span>
            离线模式 · 本地记录正常工作，网络恢复后将自动同步（待同步 {offlinePendingCount} 条）
          </span>
        </div>
      )}

      {/* iOS Safari Install Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">添加到 iPhone / iPad 主屏幕</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              1. 点击 Safari 工具栏底部的<strong>「分享」</strong>图标。
              <br />
              2. 向下滚动并选择<strong>「添加到主屏幕」</strong>即可像原生应用一样离线使用。
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <TimeFlowProvider>
      <TimeFlowShell />
    </TimeFlowProvider>
  );
}
