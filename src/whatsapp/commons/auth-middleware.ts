import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
    
  private readonly AUTH: string;

  constructor() {
    this.AUTH = "Basic UqhJeB_rsRlQmKgxl01AYi14lz7z4UNtd_t1EnQn0UEFZiCYERg-AOv1f5EsprVH1iYzKTjzEVSqqQlm0JtQ4ezvlYP6MuL8C6GELj-Duwe_7ghy9qj_z9STAD5LTwGRt5oGzA"
  }

  use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers?.authorization;
    if (auth === this.AUTH) {
      next();
    } else {
      res.status(401).json({ message: 'Unauthorized' });
    }
  }
}