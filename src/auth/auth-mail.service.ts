import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
export type AuthMailKind = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION';
type MailMessage = { kind: AuthMailKind; to: string; subject: string; text: string };
@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  readonly testDeliveries: Array<{ kind: AuthMailKind; email: string; token: string }> = [];
  private transporter?: Transporter;
  async sendPasswordReset(email: string, token: string): Promise<void> { const base = this.requireConfig(); await this.send({ kind: 'PASSWORD_RESET', to: email, subject: 'HOJE É ONDE — recuperação de senha', text: `HOJE É ONDE\n\nUse este link para redefinir sua senha (válido por 30 minutos):\n${base}/reset-password?token=${encodeURIComponent(token)}` }); }
  async sendEmailVerification(email: string, token: string): Promise<void> { const base = this.requireConfig(); await this.send({ kind: 'EMAIL_VERIFICATION', to: email, subject: 'HOJE É ONDE — verificação de e-mail', text: `HOJE É ONDE\n\nConfirme seu e-mail pelo link abaixo (válido por 24 horas):\n${base}/verify-email?token=${encodeURIComponent(token)}` }); }
  private requireConfig(): string { if (process.env.NODE_ENV === 'test') return 'http://test.invalid'; if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.APP_WEB_URL) throw new ServiceUnavailableException('Serviço de e-mail indisponível.'); return process.env.APP_WEB_URL.replace(/\/$/, ''); }
  private async send(message: MailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'test') { const match = message.text.match(/token=([^\s]+)/); this.testDeliveries.push({ kind: message.kind, email: message.to, token: match ? decodeURIComponent(match[1]) : '' }); return; }
    if (!this.transporter) { const options: SMTPTransport.Options = { host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true' }; if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) options.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }; this.transporter = nodemailer.createTransport(options); }
    try { await this.transporter.sendMail({ from: process.env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text }); } catch { this.logger.error('Auth email delivery failed.'); throw new Error('Email delivery failed.'); }
  }
}