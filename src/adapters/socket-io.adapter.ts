import { IoAdapter } from '@nestjs/platform-socket.io';

export class CustomSocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: any): any {
    return super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 15 * 1024 * 1024, // 15 MB
    });
  }
}
