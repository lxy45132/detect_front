import type { EventEnums } from '@/types/api'

/**
 * 静态兜底字典，内容逐条取自接口文档 §3.1。
 *
 * 仅在 `GET /event-categories/enums` 不可达时启用，保证筛选下拉与标签翻译不整页空白。
 * 后端枚举为唯一真源，本表若与后端不一致以后端为准。
 */
export const FALLBACK_ENUMS: EventEnums = {
  eventType: [
    { code: 100, name: '人脸' },
    { code: 200, name: '车辆' },
    { code: 300, name: '聚集' }
  ],
  task: [
    { code: 'face_capture', name: '人脸抓拍', eventType: 100 },
    { code: 'vehicle_type', name: '车辆类型', eventType: 200 },
    { code: 'license_plate', name: '车牌识别', eventType: 200 },
    { code: 'plate_unrecognized', name: '车牌未识别', eventType: 200 },
    { code: 'people_gathering', name: '人员聚集', eventType: 300 },
    // 预留：当前不在 Python 推送任务列表，字典已有 code（接口文档 §3.1 备注）
    { code: 'ship_plate', name: '船舶舷号', eventType: 200 }
  ],
  handleStatus: [
    { code: 0, name: '未处理' },
    { code: 1, name: '处理中' },
    { code: 2, name: '已处理' },
    { code: 3, name: '误报忽略' }
  ],
  priority: [
    { code: 0, name: '普通' },
    { code: 1, name: '重要' },
    { code: 2, name: '紧急' }
  ],
  ruleType: [
    { code: 'PLATE_BLACKLIST', name: '车牌黑名单' },
    { code: 'VEHICLE_TYPE', name: '车辆类型' },
    { code: 'CROWD_THRESHOLD', name: '聚集人数阈值' },
    { code: 'DEVICE_TIME', name: '设备时段' }
  ]
}
