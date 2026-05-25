const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

exports.sendOTPEmail = async (email, name, otp) => {
  await transporter.sendMail({
    from: `"Lumina Lights" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Lumina OTP Code',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <div style="background:linear-gradient(135deg,#8B6914,#C9A227);padding:32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:2px">LUMINA</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">Illuminate Your World</p>
        </div>
        <div style="padding:32px">
          <p style="color:#333;font-size:16px">Hello <strong>${name}</strong>,</p>
          <p style="color:#555">Your verification code is:</p>
          <div style="background:#FBF5E6;border:2px solid #C9A227;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
            <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#8B6914">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
        <div style="background:#f9f9f9;padding:16px;text-align:center">
          <p style="color:#aaa;font-size:12px;margin:0">© 2024 Lumina Lights. All rights reserved.</p>
        </div>
      </div>
    `
  });
};

exports.sendOrderConfirmEmail = async (email, name, order) => {
  await transporter.sendMail({
    from: `"Lumina Lights" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Order Confirmed - ${order.orderNumber}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <div style="background:linear-gradient(135deg,#8B6914,#C9A227);padding:32px;text-align:center">
          <h1 style="color:#fff;margin:0">LUMINA</h1>
        </div>
        <div style="padding:32px">
          <h2 style="color:#333">🎉 Order Confirmed!</h2>
          <p>Hi <strong>${name}</strong>, your order <strong>${order.orderNumber}</strong> has been placed successfully.</p>
          <p>Total: <strong>₹${order.total}</strong></p>
          <p style="color:#888;font-size:13px">We'll notify you once it's shipped.</p>
        </div>
      </div>
    `
  });
};

exports.sendOrderStatusEmail = async (email, name, orderNumber, status) => {
  const statusMessages = {
    confirmed: '✅ Your order has been confirmed and is being prepared.',
    shipped: '🚚 Great news! Your order is on its way.',
    delivered: '📦 Your order has been delivered. Enjoy your Lumina product!',
    cancelled: '❌ Your order has been cancelled.'
  };
  await transporter.sendMail({
    from: `"Lumina Lights" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Order ${status.charAt(0).toUpperCase() + status.slice(1)} - ${orderNumber}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <div style="background:linear-gradient(135deg,#8B6914,#C9A227);padding:32px;text-align:center">
          <h1 style="color:#fff;margin:0">LUMINA</h1>
        </div>
        <div style="padding:32px">
          <p>Hi <strong>${name}</strong>,</p>
          <p>${statusMessages[status] || 'Your order status has been updated.'}</p>
          <p>Order: <strong>${orderNumber}</strong></p>
        </div>
      </div>
    `
  });
};

exports.sendPasswordResetEmail = async (email, name, otp) => {
  await transporter.sendMail({
    from: `"Lumina Lights" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Reset Your Lumina Password',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <div style="background:linear-gradient(135deg,#8B6914,#C9A227);padding:32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:2px">LUMINA</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">Password Reset Request</p>
        </div>
        <div style="padding:32px">
          <p style="color:#333;font-size:16px">Hello <strong>${name}</strong>,</p>
          <p style="color:#555">We received a request to reset your password. Use the code below:</p>
          <div style="background:#FBF5E6;border:2px solid #C9A227;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
            <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#8B6914">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px">This code expires in <strong>10 minutes</strong>. If you did not request this, ignore this email.</p>
        </div>
        <div style="background:#f9f9f9;padding:16px;text-align:center">
          <p style="color:#aaa;font-size:12px;margin:0">© 2024 Lumina Lights. All rights reserved.</p>
        </div>
      </div>
    `
  });
};
