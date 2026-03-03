import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SuperAdminJwtGuard extends AuthGuard('superadmin-jwt') {}
