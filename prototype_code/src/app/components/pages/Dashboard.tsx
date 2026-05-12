import { Database, Package, FileText, TrendingUp } from "lucide-react";

export function Dashboard() {
  const stats = [
    { title: "物料总数", value: "1,234", icon: Package, color: "bg-blue-500" },
    { title: "类目总数", value: "156", icon: Database, color: "bg-green-500" },
    { title: "待审批申请", value: "23", icon: FileText, color: "bg-orange-500" },
    { title: "本月新增", value: "89", icon: TrendingUp, color: "bg-purple-500" },
  ];

  const recentApplications = [
    { id: 1, type: "新增物料编码", applicant: "张三", status: "审批中", date: "2026-04-28" },
    { id: 2, type: "物料停采", applicant: "李四", status: "已通过", date: "2026-04-27" },
    { id: 3, type: "新增物料类目", applicant: "王五", status: "待审批", date: "2026-04-26" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-gray-900 mb-2">仪表盘</h1>
        <p className="text-gray-600">欢迎使用 AI 物料中台管理系统</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                <p className="text-3xl text-gray-900">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg text-gray-900 mb-4">最近申请</h2>
        <div className="space-y-4">
          {recentApplications.map((app) => (
            <div key={app.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1">
                <p className="text-sm text-gray-900">{app.type}</p>
                <p className="text-xs text-gray-500 mt-1">申请人：{app.applicant}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">{app.date}</span>
                <span className={`px-2.5 py-0.5 rounded text-xs ${
                  app.status === '已通过' ? 'bg-green-100 text-green-700' :
                  app.status === '审批中' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {app.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
