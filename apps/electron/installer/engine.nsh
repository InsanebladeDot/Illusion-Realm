# 静默修复不能采用 builder 默认的强行结束客户端行为。
# 用原生 FIND_PROCESS 的 tasklist 分支查询固定程序名，不插入安装路径。
# 同名程序正在运行时退出并让向导提示正常关闭，不杀掉任何用户进程。
# FIND_PROCESS 返回零表示找到客户端，安装引擎据此退出十一。
# 向导把十一转换成可操作提示，不把占用当成安装已经完成。
# 进程名来自固定 APP_EXECUTABLE_FILENAME，不从注册表命令提取。
# 使用当前用户过滤，避免为修复自己的软件终止其他用户会话。
# 未匹配到客户端才继续原生解压，未知状态不触发强制结束命令。
# 检查只读进程清单，不调用 taskkill、Stop-Process 或 WM_CLOSE。
# 卸载器与安装器复用同一检查，不能在卸载路径意外恢复默认强杀。
# CmdPath 由已有模板定义，这里不再次声明以免同次编译冲突。
# 查询前设置 tasklist 分支标志，避免路径带引号时嵌入 PowerShell。
# 该宏不负责等待用户退出，重新尝试由向导的重试流程完成。
# 查询不需要加载 PowerShell，也不会把带单引号的目录嵌入脚本。
# 为避免另一个用户同名程序的资源被改写，当前用户安装沿用用户过滤。
# 变量只在一处声明，安装与卸载的检查宏共用同一槽位。
!macro customCheckAppRunning
  StrCpy $CmdPath "$SYSDIR\cmd.exe"
  StrCpy $IsPowerShellAvailable "1"
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    SetErrorLevel 11
    Quit
  ${EndIf}
!macroend

# 修复标志只影响先卸载旧版的步骤，不影响后续解压与注册。
# 类比修补房屋：跳过拆房，保留原屋中的用户文件，再补齐交付清单。
# 变量由 customHeader 声明，安装 section 与初始化读取同一状态。
# 卸载器由原生逻辑生成，不接收页面传入的任意命令。
# 本宏不删除卸载记录，也无需在故障后还原被临时改空的注册值。
# irRepair 在安装和卸载 section 之间只有一个声明来源。
# 标记只影响当前进程，不写入注册表或用户配置作为永久偏好。
# 缺件检测在向导中进行，宏自身不根据目录存在性猜测修复模式。
# 安装登记仍由 builder 的原生注册工序补回，不手写另一套键。
# 覆盖发行文件不会删除未收录文件，所以目录内个人数据可以保留。
# 若用户已经手动删除个人文件，这个安装标记不能把它们找回来。
# Repair 不是迁移开关，目标仍必须是向导验证过的原登记位置。
# 正常安装不带标记时保留 builder 的既有升级处理。
!macro customHeader
  Var irRepair
  Var IsPowerShellAvailable
!macroend

# initMultiUser 已选好当前用户安装范围，随后读取明确修复开关。
# 没有开关时保持原生首次安装行为，不根据目录非空自动猜测。
# GetOptions 的错误位先清理，参数缺失才是默认状态。
# 可信向导每次执行前重新核对原位置，不把浏览器状态作为目录归属。
# 生成脚本把卸载调用包在此标志条件内，不能只在末尾 customInstall 处理。
# 必须在解压前确定模式，后置宏来不及阻止旧卸载器删除文件。
# GetParameters 获取 NSIS 原命令行，不由 JavaScript 再次解析特殊字符。
# GetOptions 只查固定 Repair 选项，不把用户目录当成可执行代码。
# ClearErrors 区分参数不存在与前一条宏的残留错误状态。
# 变量初始化为零，缺省模式不会继承上一轮安装的修复选择。
# 找到显式选项才置一，生成脚本按同一个字符串值判断。
# 不改 installMode，当前用户和全用户的权限规则仍归原初始化流程。
# 可信向导不允许全用户修复，原生宏也不主动请求提升权限。
# 此处没有删除目录、清空注册键或修改用户数据的补偿动作。
# 真正结果由子进程退出码与安装后诊断共同验证。
!macro customInit
  StrCpy $irRepair "0"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/Repair" $R1
  ${IfNot} ${Errors}
    StrCpy $irRepair "1"
  ${EndIf}
!macroend

# 安装引擎只在当前用户的开始菜单目录操作本应用的链接。
# 桌面快捷方式使用 electron-builder 原生 --no-desktop-shortcut 参数。
# 开始菜单缺少对应原生参数，因此在原生创建流程之后应用用户选择。
# 不扫描或删除其他快捷方式，不使用来自页面的任意路径。
# 安装器为当前用户模式，$newStartMenuLink 已由引擎计算。
# 卸载注册由原生流程负责，不因取消创建快捷方式而跳过。
# GetOptions 的 Errors 状态必须先清理，避免继承之前的安装状态。
# 自定义参数不是 shell 命令，NSIS 按完整命令行选项读取。
# 只有明确带开关时删除本应用刚创建的链接，不默认删除已有用户选择。
# 未带开关维持 electron-builder 原生开始菜单行为。
# $newStartMenuLink 由 setLinkVars 生成，不能由页面单独指定。
# 当前用户模式使用当前用户的 $SMPROGRAMS，不写所有用户目录。
# Delete 的对象是单个链接，绝不递归移除整个开始菜单。
# 快捷方式不存在时删除无需中断已成功的应用安装。
# 本宏运行于注册应用和创建原生快捷方式之后。
# 安装成功退出前执行，使完成页看到的选项已经真正应用。
# 不实现第二个卸载器，Windows 原生卸载注册仍是唯一入口。
# 取消开始菜单不影响完成页的启动，向导从已校验的 EXE 路径启动。
# 没有 StartMenu 选项时默认创建，与界面初始勾选状态一致。
!macro customInstall
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/NoStartMenuShortcut" $R1
  ${IfNot} ${Errors}
    Delete "$newStartMenuLink"
  ${EndIf}
!macroend
