import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: App;

  onModuleInit() {
    if (!admin.apps?.length) {
      const serviceAccount = JSON.parse(
        fs.readFileSync('firebase-json-dev.json', 'utf8'),
      );
      this.app = initializeApp({
        credential: cert(serviceAccount),
      });
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return getAuth().verifyIdToken(idToken);
  }
}
