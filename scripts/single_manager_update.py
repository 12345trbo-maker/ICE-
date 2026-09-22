from pathlib import Path
p=Path('/home/ubuntu/attendglass-hyperglass/client/src/pages/Home.tsx')
s=p.read_text()
s=s.replace('import { startLogin } from "@/const";\n','')
s=s.replace('function LoginScreen({ onServerLogin }: { onServerLogin: () => void }) {','function LoginScreen() {')
s=s.replace('<div className="login-divider"><span>أو</span></div><button className="soft-button full" type="button" onClick={onServerLogin}>الدخول بالحساب المؤسسي OAuth</button>','')
s=s.replace('<LoginScreen onServerLogin={startLogin} />','<LoginScreen />')
s=s.replace('function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { role: AccountRole; name: string; phone: string; email: string; password: string; job: string }) => void }) { const [role, setRole] = useState<AccountRole>("employee");','function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { role: AccountRole; name: string; phone: string; email: string; password: string; job: string }) => void }) { const [role] = useState<AccountRole>("employee");')
s=s.replace('<option value="employee">موظف</option><option value="manager">مدير</option>','<option value="employee">موظف</option>')
s=s.replace('تتم المصادقة عبر Manus OAuth؛ لا تحفظ كلمات مرور داخل النظام.','حسابات الموظفين تُدار من خلال المدير فقط.')
old='function SettingsPage({ workDays, setWorkDays, leaveDays, setLeaveDays, latitude, setLatitude, longitude, setLongitude, radius, setRadius, penaltyUnit, setPenaltyUnit }: { workDays: number; setWorkDays: (days: number) => void; leaveDays: number; setLeaveDays: (days: number) => void; latitude: string; setLatitude: (value: string) => void; longitude: string; setLongitude: (value: string) => void; radius: number; setRadius: (value: number) => void; penaltyUnit: PenaltyUnit; setPenaltyUnit: (unit: PenaltyUnit) => void }) {'
new='function SettingsPage({ workDays, setWorkDays, leaveDays, setLeaveDays, latitude, setLatitude, longitude, setLongitude, radius, setRadius, penaltyUnit, setPenaltyUnit, onChangePassword }: { workDays: number; setWorkDays: (days: number) => void; leaveDays: number; setLeaveDays: (days: number) => void; latitude: string; setLatitude: (value: string) => void; longitude: string; setLongitude: (value: string) => void; radius: number; setRadius: (value: number) => void; penaltyUnit: PenaltyUnit; setPenaltyUnit: (unit: PenaltyUnit) => void; onChangePassword: () => void }) {'
s=s.replace(old,new)
needle='<div className="settings-grid">'
s=s.replace(needle, needle+'<section className="glass-panel settings-card"><GlassIcon tone="purple"><KeyRound size={19} /></GlassIcon><div><h3>أمان حساب المدير</h3><p className="muted">غيّر كلمة مرور المدير في أي وقت. لا يوجد مدير ثانٍ للنظام.</p></div><button className="soft-button" onClick={onChangePassword}>تغيير كلمة المرور</button></section>',1)
s=s.replace('const [accountCreator, setAccountCreator] = useState(false);','const [accountCreator, setAccountCreator] = useState(false); const [passwordChanger, setPasswordChanger] = useState(false);')
s=s.replace('const settingsMutation = trpc.attendance.settings.useMutation();','const settingsMutation = trpc.attendance.settings.useMutation();\n  const passwordMutation = trpc.auth.changePassword.useMutation({ onSuccess: () => { setPasswordChanger(false); toast.success("تم تغيير كلمة المرور"); }, onError: (error) => toast.error(error.message) });')
# insert callback before return app shell
marker='  if (!loggedIn) return <div dir={language === "ar" ? "rtl" : "ltr"} lang={language}><LoginScreen /></div>;'
s=s.replace(marker, marker+'\n  function changePassword(currentPassword: string, newPassword: string) { passwordMutation.mutate({ currentPassword, newPassword }); }')
s=s.replace('<SettingsPage workDays={workDays}', '<SettingsPage onChangePassword={() => setPasswordChanger(true)} workDays={workDays}')
s=s.replace('{accountCreator && <AccountModal onClose={() => setAccountCreator(false)} onSave={createAccount} />}</div>;','{accountCreator && <AccountModal onClose={() => setAccountCreator(false)} onSave={createAccount} />} {passwordChanger && <PasswordModal busy={passwordMutation.isPending} onClose={() => setPasswordChanger(false)} onSave={changePassword} />}</div>;')
# add modal before Home export
insert='''function PasswordModal({ onClose, onSave, busy }: { onClose: () => void; onSave: (currentPassword: string, newPassword: string) => void; busy: boolean }) { const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="glass-panel modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">أمان الحساب</span><h2>تغيير كلمة المرور</h2></div><button className="icon-button" aria-label="إغلاق" onClick={onClose}><X size={19} /></button></div><label>كلمة المرور الحالية<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>كلمة المرور الجديدة<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} autoComplete="new-password" /></label><div className="audit-note"><ShieldCheck size={15} /><span>يجب أن تتكون كلمة المرور الجديدة من 6 أحرف أو أكثر.</span></div><div className="modal-actions"><button className="soft-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={busy || currentPassword.length < 1 || newPassword.length < 6} onClick={() => onSave(currentPassword, newPassword)}>{busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}</button></div></section></div>; }
'''
s=s.replace('export default function Home() {',insert+'export default function Home() {')
p.write_text(s)

p=Path('/home/ubuntu/attendglass-hyperglass/server/db.ts')
s=p.read_text()
s=s.replace('const existing = await db.select({ id: attendanceAccounts.id }).from(attendanceAccounts)\n    .where(and(eq(attendanceAccounts.phone, phone), eq(attendanceAccounts.role, "manager"))).limit(1);','const existing = await db.select({ id: attendanceAccounts.id }).from(attendanceAccounts)\n    .where(eq(attendanceAccounts.role, "manager")).limit(1);')
needle='export async function authenticateLocalManager(phoneInput: string, password: string) {'
fn='''export async function changeLocalManagerPassword(ownerOpenId: string, currentPassword: string, newPassword: string) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const account = await db.select().from(attendanceAccounts).where(and(eq(attendanceAccounts.ownerOpenId, ownerOpenId), eq(attendanceAccounts.role, "manager"), eq(attendanceAccounts.active, 1))).limit(1); if (!account[0] || !verifyPassword(currentPassword, account[0].passwordHash)) throw new Error("INVALID_CREDENTIALS"); await db.update(attendanceAccounts).set({ passwordHash: hashPassword(newPassword) }).where(eq(attendanceAccounts.id, account[0].id)); return { success: true as const }; }\n\n'''
s=s.replace(needle,fn+needle)
p.write_text(s)

p=Path('/home/ubuntu/attendglass-hyperglass/server/routers.ts')
s=p.read_text()
s=s.replace('  authenticateLocalManager,\n  registerLocalManager,','  authenticateLocalManager,\n  registerLocalManager,\n  changeLocalManagerPassword,')
s=s.replace('registerLocalManager(input);','registerLocalManager(input);')
needle='    logout: publicProcedure.mutation(({ ctx }) => {'
route='''    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(6).max(128) })).mutation(async ({ ctx, input }) => { try { return await changeLocalManagerPassword(ctx.user.openId, input.currentPassword, input.newPassword); } catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" }); } }),\n'''
s=s.replace(needle,route+needle)
s=s.replace('role: z.enum(["manager", "employee"]),','role: z.literal("employee"),')
p.write_text(s)
